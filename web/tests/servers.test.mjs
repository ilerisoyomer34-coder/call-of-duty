// Sunucu bağlantısı (src/net/servers.js): yapıştırılan metinden adres, davet bağlantısı, sunucu başına hesap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseServerInput, inviteUrl, selectIdentity, rememberIdentity, forgetIdentity, probeServer } from '../src/net/servers.js';

const T = 'https://brave-lion-river.trycloudflare.com';

test('bağlantı: davetin tamamı, yalnız adres, şemasız adres ve sondaki eğik çizgi', () => {
  for (const s of [
    `https://ilerisoyomer34-coder.github.io/call-of-duty/?sunucu=${T}`,
    `https://ilerisoyomer34-coder.github.io/call-of-duty/?sunucu=${encodeURIComponent(T)}`,
    `  ${T}/  `,
    'brave-lion-river.trycloudflare.com',
    `Şu bağlantıya gir: ${T}`.split(': ')[1],
  ]) assert.deepEqual(parseServerInput(s), { ok: true, url: T }, s);
  assert.deepEqual(parseServerInput('http://localhost:8790'), { ok: true, url: 'http://localhost:8790' });
  assert.deepEqual(parseServerInput('http://192.168.1.20:8790/'), { ok: true, url: 'http://192.168.1.20:8790' });
});

test('bağlantı: boş, şifresiz uzak adres, oyunun kendi adresi ve saçma metin reddedilir', () => {
  assert.equal(parseServerInput('   ').error, 'empty');
  assert.equal(parseServerInput('http://brave-lion.trycloudflare.com').error, 'insecure');
  assert.equal(parseServerInput('https://ilerisoyomer34-coder.github.io/call-of-duty/').error, 'gameLink');
  assert.equal(parseServerInput('merhaba dünya').error, 'invalid');
  assert.equal(parseServerInput('ftp://x.example.com').error, 'invalid');
  assert.equal(parseServerInput('https://kullanici:sifre@x.example.com').error, 'invalid');
});

test('davet bağlantısı oyunun adresine ?sunucu= ekler (eski parametreler atılır)', () => {
  assert.equal(inviteUrl(T, 'https://ilerisoyomer34-coder.github.io/call-of-duty/?server=x#a'), `https://ilerisoyomer34-coder.github.io/call-of-duty/?sunucu=${T}`);
});

test('hesap sunucu kimliğine bağlı: tünel adresi değişse de aynı sunucuda aynı hesap', () => {
  const p = { name: 'Ayla', id: null, tag: null, token: null, server: null, servers: {} };
  assert.equal(selectIdentity(p, 's_ev'), true);
  Object.assign(p, { id: 'p_1', tag: '0042', token: 'tok1' });
  rememberIdentity(p);
  // Aynı sunucu (yeni adres, aynı serverId): değişiklik yok
  assert.equal(selectIdentity(p, 's_ev'), false);
  assert.equal(p.token, 'tok1');
  // Başka sunucu: hesap boşalır, eskisi saklanır
  assert.equal(selectIdentity(p, 's_baska'), true);
  assert.deepEqual([p.id, p.tag, p.token, p.server], [null, null, null, 's_baska']);
  Object.assign(p, { id: 'p_9', tag: '1111', token: 'tok9' });
  rememberIdentity(p);
  // Geri dönünce ilk hesap geri gelir
  selectIdentity(p, 's_ev');
  assert.deepEqual([p.id, p.tag, p.token], ['p_1', '0042', 'tok1']);
  assert.equal(p.servers.s_baska.token, 'tok9');
  // Sunucu tanımadı: yalnız o sunucunun hesabı silinir
  forgetIdentity(p);
  assert.equal(p.token, null);
  assert.equal(p.servers.s_ev, undefined);
  assert.equal(p.servers.s_baska.token, 'tok9');
});

test('kimliği bilinmeyen eski hesap ilk bağlanılan sunucuya ait sayılır', () => {
  const p = { name: 'Ayla', id: 'p_old', tag: '0001', token: 'eski', server: null, servers: {} };
  assert.equal(selectIdentity(p, 's_ev'), true);
  assert.deepEqual([p.token, p.server, p.servers.s_ev.token], ['eski', 's_ev', 'eski']);
  assert.equal(selectIdentity(p, ''), false, 'kimlik vermeyen eski sunucu: dokunulmaz');
});

test('sunucu durumu: açık, kapalı, bozuk yanıt', async () => {
  const ok = await probeServer(T, { fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, online: 3, name: "Ömer'in sunucusu", serverId: 's_ev' }) }) });
  assert.deepEqual(ok, { name: "Ömer'in sunucusu", online: 3, serverId: 's_ev' });
  assert.equal(await probeServer(T, { fetchImpl: async () => { throw new Error('ağ'); } }), null);
  assert.equal(await probeServer(T, { fetchImpl: async () => ({ ok: false, json: async () => ({}) }) }), null);
  assert.equal(await probeServer(T, { fetchImpl: async () => ({ ok: true, json: async () => ({ hello: 1 }) }) }), null);
});
