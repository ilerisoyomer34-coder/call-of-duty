// Güvenlik tabanı: sunucu kimliği kanıtı (taklit ve yeniden oynatma), güvenlik başlıkları, IP başı sınırlar,
// WebSocket bağlantı sınırı, günlük temizliği, istemcide anahtar sabitleme. Docs/SECURITY_TR.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sign } from 'node:crypto';
import WebSocket from 'ws';
import { startServer } from '../server/index.js';
import { Store } from '../server/db.js';
import { logSafe, SECURITY_HEADERS } from '../server/api.js';
import { LIMITS } from '../server/limits.js';
import { proofMessage } from '../shared/net/serverProof.js';
import { probeServer, verifyServerProof, identityVerdict, randomChallenge, selectIdentity, pinIdentity, forgetIdentity, pinnedKey } from '../src/net/servers.js';

const challenge = () => randomChallenge();

test('sunucu kimliği: imza doğrulanır, anahtar ve kimlik veritabanıyla kalıcı, dosya yalnız sahibine açık', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-sec-'));
  const dbPath = join(dir, 'db.sqlite');
  try {
    let s = await startServer({ port: 0, host: '127.0.0.1', dbPath, quiet: true });
    const url = `http://127.0.0.1:${s.port}`;
    const c = challenge();
    const a = await probeServer(url, { challenge: c });
    assert.ok(a.key && a.proof && a.serverId.startsWith('s_'));
    assert.equal(await verifyServerProof(a, c), true, 'doğru meydan okuma için imza geçerli');
    assert.equal(await verifyServerProof(a, challenge()), false, 'başka meydan okumaya ait imza geçmez (yeniden oynatma)');
    const bad = await probeServer(url, { challenge: 'kısa' });
    assert.equal(bad.proof, '', 'geçersiz meydan okuma imzalanmaz');
    if (process.platform !== 'win32') assert.equal(statSync(dbPath).mode & 0o077, 0, 'veritabanı başkalarına kapalı (0600)');
    await s.close();
    // Aynı veritabanıyla yeniden açılınca (ev sunucusu, yeni tünel adresi) kimlik ve anahtar aynı
    s = await startServer({ port: 0, host: '127.0.0.1', dbPath, quiet: true });
    const c2 = challenge();
    const b = await probeServer(`http://127.0.0.1:${s.port}`, { challenge: c2 });
    assert.equal(b.serverId, a.serverId);
    assert.equal(b.key, a.key);
    assert.equal(await verifyServerProof(b, c2), true);
    await s.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('taklitçi sunucu: başka sunucunun kimliğini kendi anahtarıyla imzalasa da sabitlenmiş anahtar tutmaz', async () => {
  const real = new Store(':memory:');
  const evil = new Store(':memory:');
  const c = challenge();
  const realInfo = { serverId: real.serverId, key: real.publicKey, proof: real.proveIdentity(c) };
  // Oyuncu gerçek sunucuya bağlandı: anahtar hesapla sabitlendi
  const profile = { name: 'Ömer', server: null, servers: {}, id: null, tag: null, token: null, key: null };
  selectIdentity(profile, real.serverId);
  assert.equal(identityVerdict(profile, realInfo, await verifyServerProof(realInfo, c)), 'ok');
  profile.token = 'gizli-belirtec';
  pinIdentity(profile, realInfo.key);
  assert.equal(pinnedKey(profile, real.serverId), real.publicKey);
  // Kötü sunucu gerçek sunucunun kimliğini söylüyor, kendi anahtarıyla imzalıyor
  const c2 = challenge();
  const forged = sign('sha256', Buffer.from(proofMessage(real.serverId, c2)), { key: evil.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const evilInfo = { serverId: real.serverId, key: evil.publicKey, proof: forged };
  assert.equal(await verifyServerProof(evilInfo, c2), true, 'imza kendi anahtarıyla geçerli…');
  assert.equal(identityVerdict(profile, evilInfo, true), 'mismatch', '…ama sabitlenmiş anahtar değil: belirteç gönderilmez');
  // Gerçek sunucunun eski imzasını yeniden oynatmak da işe yaramaz
  const replay = { ...realInfo };
  assert.equal(identityVerdict(profile, replay, await verifyServerProof(replay, c2)), 'unverified');
  // İmzasız (eski ya da sahte) sunucu
  assert.equal(identityVerdict(profile, { serverId: real.serverId, key: '', proof: '' }, false), 'unverified');
  real.close();
  evil.close();
});

test('istemci: hesaplar arası geçişte anahtarlar karışmaz, hesap silinse de anahtar sabit kalır', () => {
  const p = { name: 'x', server: null, servers: {}, id: null, tag: null, token: null, key: null };
  selectIdentity(p, 's_a');
  Object.assign(p, { id: 'p1', tag: '0001', token: 'tA' });
  pinIdentity(p, 'KEY_A');
  selectIdentity(p, 's_b');
  assert.equal(p.key, null, 'yeni sunucuda önceki anahtar etkin hesapta kalmaz');
  assert.equal(p.token, null);
  pinIdentity(p, 'KEY_B');
  selectIdentity(p, 's_a');
  assert.equal(p.key, 'KEY_A');
  assert.equal(p.token, 'tA');
  forgetIdentity(p);
  assert.equal(p.token, null);
  assert.equal(pinnedKey(p, 's_a'), 'KEY_A', 'hesap gitse de taklit tanınır');
  // Anahtarsız eski kayıt: önceki sunucunun anahtarı devralınmaz
  const old = { name: 'y', server: 's_b', key: 'KEY_B', token: 't', servers: { s_a: { id: 'p', tag: '1', token: 'tA' } } };
  selectIdentity(old, 's_a');
  assert.equal(old.key, null);
});

test('API: güvenlik başlıkları, geçersiz belirteç seli IP başına durur', async () => {
  const s = await startServer({ port: 0, host: '127.0.0.1', dbPath: ':memory:', quiet: true });
  const base = `http://127.0.0.1:${s.port}`;
  try {
    const h = await fetch(`${base}/api/health`);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(h.headers.get(k), v, k);
    assert.equal(h.headers.get('cache-control'), 'no-store');
    let last = 0;
    for (let i = 0; i <= LIMITS.authFail.max; i++) {
      const r = await fetch(`${base}/api/me`, { headers: { authorization: `Bearer yanlis-${i}` } });
      last = r.status;
    }
    assert.equal(last, 429, 'sınırdan sonra geçersiz belirteç denemesi reddedilir');
    const long = await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${'x'.repeat(LIMITS.tokenMax + 1)}` } });
    assert.equal(long.status, 429, 'aynı IP hâlâ sınırda');
  } finally {
    await s.close();
  }
});

test('WebSocket: IP başına açık sosyal bağlantı sınırlı (kimliksiz sel)', async () => {
  const s = await startServer({ port: 0, host: '127.0.0.1', dbPath: ':memory:', quiet: true });
  const url = `ws://127.0.0.1:${s.port}/ws`;
  const socks = [];
  try {
    const open = () =>
      new Promise((resolve) => {
        const ws = new WebSocket(url);
        socks.push(ws);
        ws.on('open', () => resolve('open'));
        ws.on('error', () => resolve('refused'));
        ws.on('unexpected-response', () => resolve('refused'));
      });
    const results = [];
    for (let i = 0; i < LIMITS.wsPerIp + 2; i++) results.push(await open());
    assert.equal(results.filter((r) => r === 'open').length, LIMITS.wsPerIp);
    assert.equal(results.at(-1), 'refused');
    // Bağlantılar kapanınca yer açılır
    for (const ws of socks) ws.terminate();
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(await open(), 'open');
  } finally {
    for (const ws of socks) ws.terminate();
    await s.close();
  }
});

test('günlük: kullanıcı metnindeki denetim karakterleri sahte satır üretemez', () => {
  const out = logSafe('a\nb\r[SAHTE] c\u001b[31m d');
  assert.ok(!new RegExp('[\\n\\r\\u001b\\u2028]').test(out), out);
  assert.equal(logSafe('x'.repeat(500)).length, 80);
});
