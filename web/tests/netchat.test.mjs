// Maç içi iletişim (M8): sohbet metninin temizlenmesi, hız sınırı, kimin göreceği, telsiz kalıpları, takım işareti
// ve odanın bunları doğru alıcılara dağıtması.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CollisionWorld } from '../shared/sim/collision.js';
import { MSG, SIDE, CHAT_FLAG, MARK_KIND } from '../shared/net/protocol.js';
import { Writer, encodeChat, encodeMark, decodeClient, decodeServer } from '../shared/net/codec.js';
import { RADIO_LINES, radioWheel, sanitizeChat, TokenBucket, chatVisible, markValid } from '../shared/net/chat.js';
import { ONLINE } from '../src/config.js';
import { Room } from '../server/game/room.js';
import { modeRules } from '../server/game/rooms.js';
import ARENAS from '../src/data/arenas.json' with { type: 'json' };

const world = CollisionWorld.fromJSON(JSON.parse(readFileSync(new URL('../shared/maps/depo.collision.json', import.meta.url), 'utf8')));
const w = new Writer();

test('sohbet metni: denetim ve yön karakterleri atılır, boşluk tekleşir, en çok maxLen harf', () => {
  assert.equal(sanitizeChat('  merhaba \n\t takım  '), 'merhaba takım');
  // Sağdan sola çevirme (U+202E) başkasının ekranında metni ters gösteremez
  assert.equal(sanitizeChat(`ab${String.fromCodePoint(0x202e)}cd${String.fromCodePoint(0)}ef`), 'ab cd ef');
  assert.equal(sanitizeChat('   '), '');
  assert.equal(sanitizeChat(42), '');
  const long = 'ş'.repeat(ONLINE.chat.maxLen + 30);
  assert.equal(Array.from(sanitizeChat(long)).length, ONLINE.chat.maxLen);
  // Çok baytlı harf bayt sınırında yarılmaz (codec harf sınırında keser)
  const m = decodeClient(encodeChat(w, { flags: CHAT_FLAG.TEAM, text: '🚀'.repeat(100) }));
  assert.equal(m.type, MSG.C_CHAT);
  assert.ok(!m.text.includes(String.fromCodePoint(0xfffd)) && new TextEncoder().encode(m.text).length <= 255);
});

test('jeton kovası: art arda burst ileti, sonra saniyede perSec', () => {
  const b = new TokenBucket(1, 3);
  assert.deepEqual([b.allow(0), b.allow(0), b.allow(0), b.allow(0)], [true, true, true, false]);
  assert.equal(b.allow(0.5), false);
  assert.equal(b.allow(1.05), true);
  assert.equal(b.allow(1.1), false);
  assert.equal(b.allow(10), true, 'uzun aradan sonra en çok burst birikir');
  assert.deepEqual([b.allow(10), b.allow(10), b.allow(10)], [true, true, false]);
});

test('kim görür: takım kanalı aynı tarafa, ÖM\'de herkese; Rekabetçide ölünün "herkese"si yalnız ölülere', () => {
  const blue = { side: SIDE.BLUE, alive: true };
  const red = { side: SIDE.RED, alive: true };
  const sided = { sided: true, deadChat: false };
  assert.equal(chatVisible({ team: true }, blue, { ...blue }, sided), true);
  assert.equal(chatVisible({ team: true }, blue, red, sided), false);
  assert.equal(chatVisible({ team: true }, blue, { side: SIDE.BLUE, alive: false }, sided), true, 'ölü takım arkadaşı da okur');
  assert.equal(chatVisible({ team: false }, blue, red, sided), true);
  assert.equal(chatVisible({ team: true }, { side: SIDE.NONE }, { side: SIDE.NONE }, { sided: false }), true, 'ÖM: takım yok, herkese');
  const comp = { sided: true, deadChat: true };
  const deadBlue = { side: SIDE.BLUE, alive: false };
  assert.equal(chatVisible({ team: false, dead: true }, deadBlue, red, comp), false, 'canlı rakip ölünün sözünü görmez');
  assert.equal(chatVisible({ team: false, dead: true }, deadBlue, { side: SIDE.RED, alive: false }, comp), true);
  assert.equal(chatVisible({ team: true, dead: true }, deadBlue, blue, comp), true, 'takım kanalı ölüyken de takıma');
});

test('telsiz kalıpları: çarkta sekiz geçerli kalıp, Rekabetçide bomba kalıpları; ağ dizini katalog sırası', () => {
  for (const comp of [false, true]) {
    const wh = radioWheel(comp);
    assert.equal(wh.length, 8);
    assert.ok(wh.every((i) => Number.isInteger(i) && RADIO_LINES[i]?.text), JSON.stringify(wh));
  }
  assert.ok(radioWheel(true).some((i) => RADIO_LINES[i].id === 'plantA') && !radioWheel(false).some((i) => RADIO_LINES[i].id === 'plantA'));
  assert.equal(new Set(RADIO_LINES.map((l) => l.id)).size, RADIO_LINES.length, 'kimlikler tekil');
});

test('takım işareti: menzil ve görüş hattı (duvar arkasına konamaz)', () => {
  const eye = { x: 0, y: 1.6, z: 0 };
  const open = { lineOfSight: () => true };
  const wall = { lineOfSight: () => false };
  assert.equal(markValid(open, eye, { x: 10, y: 0, z: 5 }), true);
  assert.equal(markValid(wall, eye, { x: 10, y: 0, z: 5 }), false);
  assert.equal(markValid(open, eye, { x: ONLINE.chat.markRange + 1, y: 0, z: 0 }), false);
  assert.equal(markValid(open, eye, { x: NaN, y: 0, z: 0 }), false);
});

// --- Oda: alıcılar ---
function fakeConn() {
  const got = [];
  return { got, transport: { send: (b) => got.push(decodeServer(b)), close() {} }, all: (type) => got.filter((m) => m?.type === type) };
}

function tdmRoom() {
  let t = 0;
  const room = new Room({ code: 'CHAT01', kind: 'match', mode: 'tdm', rules: { ...modeRules('tdm'), warmup: 0 }, mapId: 'depo', world, arena: ARENAS.depo, manual: true, now: () => t });
  room.advance = (n) => {
    for (let i = 0; i < n; i++) {
      t += 1000 / 64;
      room.tick();
    }
  };
  room.sleep = (sec) => (t += sec * 1000);
  return room;
}

function join(room, id, side) {
  room.reserve([id], '', side);
  const c = fakeConn();
  assert.equal(room.join(c, { primary: 'rifle', secondary: 'pistol' }, { id, name: id, tag: 1 }), 0);
  room.onMessage(c, { type: MSG.C_LOADED });
  return c;
}

const say = (room, c, flags, text) => room.onMessage(c, decodeClient(encodeChat(w, { flags, text })));

test('oda: takım sohbeti yalnız aynı tarafa, herkese sohbeti herkese; gönderen kendi satırını görür', () => {
  const room = tdmRoom();
  const a = join(room, 'p_a', SIDE.BLUE);
  const b = join(room, 'p_b', SIDE.BLUE);
  const r = join(room, 'p_r', SIDE.RED);
  room.advance(4);
  say(room, a, CHAT_FLAG.TEAM, 'sol koridor');
  say(room, a, 0, '  iyi oyunlar  ');
  const line = (c) => c.all(MSG.S_CHAT).map((m) => `${m.flags & CHAT_FLAG.TEAM ? 'T' : 'H'}:${m.text}`);
  assert.deepEqual(line(a), ['T:sol koridor', 'H:iyi oyunlar']);
  assert.deepEqual(line(b), ['T:sol koridor', 'H:iyi oyunlar']);
  assert.deepEqual(line(r), ['H:iyi oyunlar'], 'rakip takım sohbetini görmez');
  assert.equal(a.all(MSG.S_CHAT)[0].slot, room.slotOf.get('p_a'));
});

test('oda: hız sınırı (art arda 3, sonra saniyede 1), boş metin ve geçersiz kalıp atılır', () => {
  const room = tdmRoom();
  const a = join(room, 'p_a', SIDE.BLUE);
  const b = join(room, 'p_b', SIDE.BLUE);
  room.advance(4);
  for (let i = 0; i < 6; i++) say(room, a, 0, `ileti ${i}`);
  assert.equal(b.all(MSG.S_CHAT).length, ONLINE.chat.burst);
  room.sleep(1.1);
  say(room, a, 0, 'bir saniye sonra');
  assert.equal(b.all(MSG.S_CHAT).length, ONLINE.chat.burst + 1);
  room.sleep(5);
  say(room, a, 0, '\u0000\u0007  ');
  room.onMessage(a, { type: MSG.C_CHAT, flags: CHAT_FLAG.RADIO | CHAT_FLAG.TEAM, radio: RADIO_LINES.length });
  assert.equal(b.all(MSG.S_CHAT).length, ONLINE.chat.burst + 1, 'boş metin ve geçersiz kalıp dağıtılmaz');
  room.onMessage(a, decodeClient(encodeChat(w, { flags: CHAT_FLAG.RADIO | CHAT_FLAG.TEAM, radio: 4 })));
  const last = b.all(MSG.S_CHAT).at(-1);
  assert.ok(last.flags & CHAT_FLAG.RADIO && last.radio === 4 && RADIO_LINES[last.radio].text);
});

test('oda: işaret görüş hattında ve menzilde ise yalnız takıma gider', () => {
  const room = tdmRoom();
  const a = join(room, 'p_a', SIDE.BLUE);
  const b = join(room, 'p_b', SIDE.BLUE);
  const r = join(room, 'p_r', SIDE.RED);
  room.advance(4);
  const p = room.sim.players[room.slotOf.get('p_a')];
  assert.ok(p.alive);
  const near = { x: p.state.pos.x + 0.6, y: p.state.pos.y + 0.05, z: p.state.pos.z };
  room.onMessage(a, decodeClient(encodeMark(w, { kind: MARK_KIND.ENEMY, pos: near })));
  const got = b.all(MSG.S_MARK);
  assert.equal(got.length, 1);
  assert.equal(got[0].kind, MARK_KIND.ENEMY);
  assert.ok(Math.abs(got[0].pos.x - near.x) < 0.02);
  assert.equal(a.all(MSG.S_MARK).length, 1, 'koyan da görür');
  assert.equal(r.all(MSG.S_MARK).length, 0, 'rakip görmez');
  // Menzil dışı reddedilir
  room.onMessage(a, decodeClient(encodeMark(w, { kind: MARK_KIND.HERE, pos: { x: p.state.pos.x + ONLINE.chat.markRange + 20, y: 0, z: p.state.pos.z } })));
  assert.equal(b.all(MSG.S_MARK).length, 1);
});
