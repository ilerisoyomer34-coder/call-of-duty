// Çevrim içi sunucu (server/): kimlik, arama, arkadaşlık istekleri, anlık bildirimler, durum, parti ve davet,
// hata durumları ve dayanıklılık. Sunucu bellek içi veritabanıyla rastgele portta açılır.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startServer } from '../server/index.js';

let srv;
let base;
before(async () => {
  // Vekil başlığına güvenilir: her oturum açma farklı "IP"den gelsin (IP başına sınır testleri boğmasın)
  srv = await startServer({ port: 0, host: '127.0.0.1', dbPath: ':memory:', quiet: true, trustProxy: true });
  base = `http://127.0.0.1:${srv.port}`;
});
after(async () => srv.close());

let ipSeq = 0;
async function call(method, path, body, token, headers = {}) {
  if (path === '/api/session' && !headers['x-forwarded-for']) headers = { ...headers, 'x-forwarded-for': `10.0.0.${++ipSeq}` };
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

// WebSocket istemcisi: gelen iletiler kuyrukta, bekle(tür)
function connect(token, status = 'menu') {
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
  const queue = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
    else queue.push(m);
  });
  const wait = (pred, ms = 3000) => {
    const f = typeof pred === 'string' ? (m) => m.t === pred : pred;
    const i = queue.findIndex(f);
    if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = { pred: f, resolve };
      waiters.push(w);
      setTimeout(() => reject(new Error(`bekleme: ${pred}`)), ms);
    });
  };
  const opened = new Promise((r) => ws.on('open', r)).then(() => ws.send(JSON.stringify({ t: 'hello', token, status })));
  return { ws, wait, opened, close: () => ws.close() };
}

test('kimlik: ad kuralları, aynı ada farklı etiket', async () => {
  const a = await call('POST', '/api/session', { name: '  Ömer  ' });
  assert.equal(a.status, 200);
  assert.equal(a.body.name, 'Ömer');
  assert.match(a.body.tag, /^\d{4}$/);
  assert.ok(a.body.token.length > 30 && a.body.id.startsWith('p_'));
  const b = await call('POST', '/api/session', { name: 'ömer' });
  assert.notEqual(b.body.tag, a.body.tag, 'aynı ad, farklı etiket');
  assert.equal((await call('POST', '/api/session', { name: 'ab' })).body.error, 'name_short');
  assert.equal((await call('POST', '/api/session', { name: 'amk' })).body.error, 'name_banned');
  assert.equal((await call('GET', '/api/me', undefined, 'yanlis')).status, 401);
  const me = await call('GET', '/api/me', undefined, a.body.token);
  assert.equal(me.body.name, 'Ömer');
  // Ad değişince etiket boşsa korunur
  const r = await call('PATCH', '/api/me', { name: 'Ömer Kaya' }, a.body.token);
  assert.equal(r.body.tag, a.body.tag);
});

test('arama → istek → anlık bildirim → kabul → arkadaş listesi ve durum', async () => {
  const ece = (await call('POST', '/api/session', { name: 'Ece' })).body;
  const deniz = (await call('POST', '/api/session', { name: 'Deniz' })).body;
  const we = connect(ece.token);
  const wd = connect(deniz.token);
  await Promise.all([we.opened, wd.opened]);
  const welcome = await wd.wait('welcome');
  assert.equal(welcome.me.name, 'Deniz');
  await we.wait('welcome');
  // Türkçe katlama: "ece" ve "ECE" bulur, kendini bulmaz
  const s = await call('GET', '/api/players?q=EC', undefined, deniz.token);
  const found = s.body.players.find((p) => p.id === ece.id);
  assert.ok(found && found.relation === 'none' && found.status === 'menu');
  assert.equal((await call('GET', `/api/players?q=Deniz`, undefined, deniz.token)).body.players.length, 0);
  assert.equal((await call('GET', `/api/players?q=e`, undefined, deniz.token)).body.error, 'query_short');
  const tagged = await call('GET', `/api/players?q=ece%23${ece.tag}`, undefined, deniz.token);
  assert.equal(tagged.body.players[0].id, ece.id);
  // İstek
  const req = await call('POST', '/api/friends/request', { id: ece.id }, deniz.token);
  assert.equal(req.body.relation, 'outgoing');
  const note = await we.wait((m) => m.t === 'notification' && m.n.kind === 'friend_request');
  assert.equal(note.n.from.name, 'Deniz');
  assert.equal((await call('POST', '/api/friends/request', { id: ece.id }, deniz.token)).body.error, 'already_requested');
  assert.equal((await call('POST', '/api/friends/request', { id: deniz.id }, deniz.token)).body.error, 'self');
  const lists = await call('GET', '/api/friends', undefined, ece.token);
  assert.equal(lists.body.incoming[0].id, deniz.id);
  // Kabul: gönderen bildirim alır, ikisi de arkadaş listesinde çevrim içi görür
  const acc = await call('POST', '/api/friends/respond', { id: deniz.id, accept: true }, ece.token);
  assert.equal(acc.body.relation, 'friend');
  const accN = await wd.wait((m) => m.t === 'notification' && m.n.kind === 'friend_accepted');
  assert.equal(accN.n.from.name, 'Ece');
  const fl = await call('GET', '/api/friends', undefined, deniz.token);
  assert.equal(fl.body.friends[0].id, ece.id);
  assert.equal(fl.body.friends[0].status, 'menu');
  // Durum: Ece oyuna girer → Deniz görür; Ece kapanınca çevrim dışı
  we.ws.send(JSON.stringify({ t: 'status', status: 'playing' }));
  assert.equal((await wd.wait((m) => m.t === 'presence' && m.id === ece.id && m.status === 'playing')).status, 'playing');
  we.close();
  assert.equal((await wd.wait((m) => m.t === 'presence' && m.id === ece.id && m.status === 'offline')).status, 'offline');
  // Çevrim dışıyken gelen istek bildirimlerde bekler
  const can = (await call('POST', '/api/session', { name: 'Can' })).body;
  await call('POST', '/api/friends/request', { id: ece.id }, can.token);
  const notes = await call('GET', '/api/notifications', undefined, ece.token);
  assert.ok(notes.body.notifications.some((n) => n.kind === 'friend_request' && n.from.name === 'Can' && !n.seen));
  await call('POST', '/api/notifications/seen', {}, ece.token);
  assert.ok((await call('GET', '/api/notifications', undefined, ece.token)).body.notifications.every((n) => n.seen));
  // Reddet: istek silinir
  const rej = await call('POST', '/api/friends/respond', { id: can.id, accept: false }, ece.token);
  assert.equal(rej.body.relation, 'none');
  assert.equal((await call('GET', '/api/friends', undefined, can.token)).body.outgoing.length, 0);
  // Karşılıklı istek kendiliğinden kabul
  await call('POST', '/api/friends/request', { id: can.id }, deniz.token);
  assert.equal((await call('POST', '/api/friends/request', { id: deniz.id }, can.token)).body.relation, 'friend');
  // Arkadaşlıktan çıkar
  assert.equal((await call('POST', '/api/friends/remove', { id: can.id }, deniz.token)).body.relation, 'none');
  wd.close();
});

test('parti: davet, katıl, mod, lider devri, yetkisiz değişiklik', async () => {
  const mk = async (n) => (await call('POST', '/api/session', { name: n })).body;
  const [a, b, c] = [await mk('Lider'), await mk('Uye'), await mk('Yabanci')];
  await call('POST', '/api/friends/request', { id: b.id }, a.token);
  await call('POST', '/api/friends/respond', { id: a.id, accept: true }, b.token);
  const wa = connect(a.token);
  const wb = connect(b.token);
  await Promise.all([wa.opened, wb.opened]);
  await wa.wait('welcome');
  await wb.wait('welcome');
  assert.equal((await call('POST', '/api/party/invite', { id: c.id }, a.token)).body.error, 'not_friend');
  const inv = await call('POST', '/api/party/invite', { id: b.id }, a.token);
  assert.ok(inv.body.ok);
  const got = await wb.wait('party_invite');
  assert.equal(got.invite.from.name, 'Lider');
  assert.equal((await call('POST', '/api/party/respond', { inviteId: got.invite.id, accept: true }, c.token)).body.error, 'no_invite');
  const join = await call('POST', '/api/party/respond', { inviteId: got.invite.id, accept: true }, b.token);
  assert.equal(join.body.party.members.length, 2);
  assert.equal(join.body.party.leader, a.id);
  // Mod yalnız liderden
  assert.equal((await call('POST', '/api/party/mode', { mode: 'dm' }, b.token)).body.error, 'not_leader');
  assert.equal((await call('POST', '/api/party/mode', { mode: 'yok' }, a.token)).body.error, 'bad_mode');
  await call('POST', '/api/party/mode', { mode: 'dm' }, a.token);
  assert.equal((await wb.wait((m) => m.t === 'party' && m.party?.mode === 'dm')).party.mode, 'dm');
  // Reddedilen davet için kurulan tek kişilik parti dağılır
  const d = await mk('Davetli');
  await call('POST', '/api/friends/request', { id: d.id }, b.token);
  await call('POST', '/api/friends/respond', { id: b.id, accept: true }, d.token);
  const wd = connect(d.token);
  await wd.opened;
  await wd.wait('welcome');
  await call('POST', '/api/party/invite', { id: d.id }, a.token).then((r) => assert.equal(r.body.error, 'not_friend'));
  // Lider ayrılınca iki kişilik parti dağılır
  await call('POST', '/api/party/leave', {}, a.token);
  assert.equal((await wb.wait((m) => m.t === 'party' && m.party === null)).party, null);
  assert.equal((await call('GET', '/api/party', undefined, b.token)).body.party, null);
  // B, D'yi davet eder (B'nin partisi kurulur), D reddeder → B'nin tek kişilik partisi dağılır
  await call('POST', '/api/party/invite', { id: d.id }, b.token);
  assert.equal((await call('GET', '/api/party', undefined, b.token)).body.party.members.length, 1);
  const inv2 = await wd.wait('party_invite');
  await call('POST', '/api/party/respond', { inviteId: inv2.invite.id, accept: false }, d.token);
  await wb.wait('party_invite_declined');
  assert.equal((await call('GET', '/api/party', undefined, b.token)).body.party, null);
  wa.close();
  wb.close();
  wd.close();
});

test('dayanıklılık: bozuk JSON, büyük gövde, yanlış yol, kimliksiz WebSocket, hız sınırı', async () => {
  assert.equal((await call('POST', '/api/session', '{bozuk')).body.error, 'bad_json');
  assert.equal((await call('POST', '/api/session', { name: 'x'.repeat(5000) })).status, 413);
  assert.equal((await call('GET', '/api/yok')).status, 404);
  assert.equal((await call('GET', '/api/health', undefined, null, { origin: 'https://kotu.example' })).status, 403);
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'hello', token: 'yanlis' }));
  const code = await new Promise((r) => ws.on('close', (c) => r(c)));
  assert.equal(code, 4001);
  // Oturum açma IP başına sınırlı (önceki testler de saydı)
  let limited = false;
  for (let i = 0; i < 8 && !limited; i++) limited = (await call('POST', '/api/session', { name: `Sinir${'abcdefgh'[i]}` }, null, { 'x-forwarded-for': '10.9.9.9' })).status === 429;
  assert.ok(limited, 'oturum hız sınırı');
  // Sunucu hâlâ ayakta
  assert.equal((await call('GET', '/api/health')).body.ok, true);
});
