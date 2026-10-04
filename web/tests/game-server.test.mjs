// Oyun bağlantısı (/game) ve eşleştirme, gerçek sunucuyla: el sıkışma, sürüm/derleme/üyelik reddi, bozuk ileti
// sınırı, deneme odası, hızlı maç (takım aynı tarafta, karışık oyuncular, eksik yer yapay zekâ).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startServer } from '../server/index.js';
import { PROTOCOL_VERSION } from '../shared/constants.js';
import { MSG, ERR, RF } from '../shared/net/protocol.js';
import { Writer, encodeHello, encodeSimple, encodeInput, encodePing, decodeServer } from '../shared/net/codec.js';

let srv;
let base;
before(async () => {
  srv = await startServer({ port: 0, host: '127.0.0.1', dbPath: ':memory:', quiet: true, trustProxy: true, searchSec: 0.5, warmupSec: 0 });
  base = `http://127.0.0.1:${srv.port}`;
});
after(async () => srv.close());

let ipSeq = 0;
async function call(method, path, body, token) {
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${++ipSeq}` };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

function queueOf(ws, parse) {
  const queue = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = parse(d);
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
    else queue.push(m);
  });
  return (pred, ms = 4000) => {
    const i = queue.findIndex(pred);
    if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      waiters.push({ pred, resolve });
      setTimeout(() => reject(new Error('bekleme zaman aşımı')), ms);
    });
  };
}

function social(token) {
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
  const wait = queueOf(ws, (d) => JSON.parse(String(d)));
  const opened = new Promise((r) => ws.on('open', r)).then(() => ws.send(JSON.stringify({ t: 'hello', token, status: 'menu' })));
  return { ws, wait, opened };
}

const w = new Writer();
function game(hello) {
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/game`);
  ws.binaryType = 'nodebuffer';
  const wait = queueOf(ws, (d) => decodeServer(new Uint8Array(d)));
  const closed = new Promise((r) => ws.on('close', (code) => r(code)));
  const opened = new Promise((r) => ws.on('open', r)).then(() => {
    if (hello) ws.send(encodeHello(w, { protocolVersion: PROTOCOL_VERSION, buildHash: srv.buildHash, primary: 'rifle', secondary: 'pistol', ...hello }));
  });
  return { ws, wait, closed, opened, send: (b) => ws.send(b) };
}

const mk = async (n) => (await call('POST', '/api/session', { name: n })).body;

test('deneme odası: el sıkışma, karşılama, doğuş, ping, anlık görüntü; reddedilen bağlantılar', async () => {
  const a = await mk('Odaci');
  const out = await mk('Yabanci');
  const sa = social(a.token);
  await sa.opened;
  await sa.wait((m) => m.t === 'welcome');
  const r = await call('POST', '/api/party/sandbox', {}, a.token);
  assert.equal(r.status, 200);
  const code = r.body.match.room;
  assert.match(code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  const g = game({ token: a.token, room: code });
  await g.opened;
  const wel = await g.wait((m) => m?.type === MSG.S_WELCOME);
  assert.equal(wel.mode, 'sandbox');
  assert.equal(wel.map, 'depo');
  assert.equal(wel.tickRate, 64);
  const roster = await g.wait((m) => m?.type === MSG.S_ROSTER);
  assert.equal(roster.players.length, 1);
  assert.equal(roster.players[0].name, 'Odaci');
  g.send(encodeSimple(w, MSG.C_LOADED));
  const snap = await g.wait((m) => m?.type === MSG.S_SNAPSHOT && m.me.alive);
  assert.ok(snap.me.state, 'yerel kayıt');
  g.send(encodePing(w, 123.5));
  const pong = await g.wait((m) => m?.type === MSG.S_PONG);
  assert.equal(pong.clientTime, 123.5);
  assert.ok(pong.serverTick > 0);
  // Komutlar işlenir (onay sırası ilerler)
  for (let i = 1; i <= 20; i++) g.send(encodeInput(w, snap.tick, [{ seq: i, buttons: 0, moveX: 0, moveY: 1, yaw: 0, pitch: 0, slot: 0, fireMode: 0, viewTick: 0, shots: [] }]));
  const later = await g.wait((m) => m?.type === MSG.S_SNAPSHOT && m.ackSeq === 20);
  assert.ok(later.me.state.pos.z < snap.me.state.pos.z - 0.5, 'ileri yürüdü');

  // Yanlış derleme özeti
  const bad = game({ token: a.token, room: code, buildHash: 'eski' });
  assert.equal((await bad.wait((m) => m?.type === MSG.S_ERROR)).code, ERR.BUILD_MISMATCH);
  await bad.closed;
  // Eski protokol
  const old = game({ token: a.token, room: code, protocolVersion: PROTOCOL_VERSION + 1 });
  assert.equal((await old.wait((m) => m?.type === MSG.S_ERROR)).code, ERR.VERSION_MISMATCH);
  // Davetsiz oyuncu, olmayan oda, yanlış kimlik
  const stranger = game({ token: out.token, room: code });
  assert.equal((await stranger.wait((m) => m?.type === MSG.S_ERROR)).code, ERR.NOT_MEMBER);
  const nowhere = game({ token: a.token, room: 'ZZZZZZ' });
  assert.equal((await nowhere.wait((m) => m?.type === MSG.S_ERROR)).code, ERR.ROOM_NOT_FOUND);
  const anon = game({ token: 'yok', room: code });
  assert.equal((await anon.wait((m) => m?.type === MSG.S_ERROR)).code, ERR.AUTH_FAILED);
  // Üç bozuk ileti → atılır (oda ve diğer bağlantı etkilenmez)
  const junk = game(null);
  await junk.opened;
  for (let i = 0; i < 3; i++) junk.ws.send(new Uint8Array([0x7f, 1, 2]));
  assert.equal((await junk.wait((m) => m?.type === MSG.S_ERROR)).code, ERR.BAD_MESSAGE);
  await junk.closed;
  g.send(encodePing(w, 7));
  assert.equal((await g.wait((m) => m?.type === MSG.S_PONG && m.clientTime === 7)).clientTime, 7);
  g.ws.close();
  sa.ws.close();
});

test('hızlı maç: takım aynı tarafta, ikinci oyuncu aynı maça (karışık), eksik yer yapay zekâ', async () => {
  const [a, b, c] = [await mk('Lider'), await mk('Uye'), await mk('Tekci')];
  await call('POST', '/api/friends/request', { id: b.id }, a.token);
  await call('POST', '/api/friends/respond', { id: a.id, accept: true }, b.token);
  const [sa, sb, sc] = [social(a.token), social(b.token), social(c.token)];
  await Promise.all([sa.opened, sb.opened, sc.opened]);
  for (const s of [sa, sb, sc]) await s.wait((m) => m.t === 'welcome');
  const inv = await call('POST', '/api/party/invite', { id: b.id }, a.token);
  assert.ok(inv.body.ok);
  const got = await sb.wait((m) => m.t === 'party_invite');
  await call('POST', '/api/party/respond', { inviteId: got.invite.id, accept: true }, b.token);
  // Yalnız lider arar
  assert.equal((await call('POST', '/api/match/queue', { mode: 'tdm' }, b.token)).body.error, 'not_leader');
  assert.equal((await call('POST', '/api/match/queue', { mode: 'competitive' }, a.token)).body.error, 'bad_mode');
  const q = await call('POST', '/api/match/queue', { mode: 'tdm' }, a.token);
  assert.ok(q.body.ok);
  assert.equal((await sb.wait((m) => m.t === 'queue' && m.queue)).queue.mode, 'tdm', 'üye de kuyrukta görür');
  const ma = (await sa.wait((m) => m.t === 'match', 5000)).match;
  const mb = (await sb.wait((m) => m.t === 'match', 5000)).match;
  assert.equal(ma.room, mb.room);
  assert.equal(ma.side, mb.side, 'takım aynı tarafta');
  // İkinci arayan oyuncu süren maça katılır (bot yeri insana açılır)
  await call('POST', '/api/match/queue', { mode: 'tdm' }, c.token);
  const mc = (await sc.wait((m) => m.t === 'match', 5000)).match;
  assert.equal(mc.room, ma.room, 'karışık: aynı maç');
  const ga = game({ token: a.token, room: ma.room });
  const gb = game({ token: b.token, room: mb.room });
  const gc = game({ token: c.token, room: mc.room });
  await Promise.all([ga.opened, gb.opened, gc.opened]);
  for (const g of [ga, gb, gc]) {
    await g.wait((m) => m?.type === MSG.S_WELCOME);
    g.send(encodeSimple(w, MSG.C_LOADED));
  }
  const roster = await ga.wait((m) => m?.type === MSG.S_ROSTER && m.players.filter((p) => !(p.flags & RF.BOT)).length === 3);
  assert.equal(roster.players.length, 8, '4v4: üç insan + beş yapay zekâ');
  const A = roster.players.find((p) => p.name === 'Lider');
  const B = roster.players.find((p) => p.name === 'Uye');
  assert.equal(A.side, B.side);
  assert.equal(A.party, B.party);
  assert.ok(A.party.length > 0);
  const snap = await gc.wait((m) => m?.type === MSG.S_SNAPSHOT && m.players.length === 7);
  assert.ok(snap.players.length === 7);
  // Ayrılan oyuncunun yerine yapay zekâ girer
  gc.ws.close();
  const after = await ga.wait((m) => m?.type === MSG.S_ROSTER && m.players.filter((p) => !(p.flags & RF.BOT)).length === 2);
  assert.equal(after.players.length, 8);
  ga.ws.close();
  gb.ws.close();
  for (const s of [sa, sb, sc]) s.ws.close();
});
