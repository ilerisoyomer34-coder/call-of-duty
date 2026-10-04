// İkili ileti kodlayıcı (shared/net/codec.js): gidiş-dönüş eşitliği, nicemleme hata sınırları, bozuk ileti.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MSG, NEV, ERR, PHASE } from '../shared/net/protocol.js';
import { Writer, encodeHello, encodeInput, encodePing, encodeSimple, decodeClient, encodeWelcome, encodeRoster, encodePong, encodeError, encodeMatchEnd, encodeSnapshot, decodeServer, encYaw, decYaw, encPitch, decPitch, quantizeCmd } from '../shared/net/codec.js';
import { mulberry32 } from '../shared/sim/rng.js';

const w = new Writer(16); // küçük başlar: büyüme de denenir

test('el sıkışma, ping ve basit iletiler gidip gelir', () => {
  const h = { protocolVersion: 1, buildHash: 'abc123def456', token: 'x'.repeat(64), room: 'K7M2PQ', primary: 'rifle', secondary: 'pistol' };
  assert.deepEqual(decodeClient(encodeHello(w, h)), { type: MSG.C_HELLO, ...h });
  assert.deepEqual(decodeClient(encodePing(w, 123456.789)), { type: MSG.C_PING, clientTime: 123456.789 });
  assert.deepEqual(decodeClient(encodeSimple(w, MSG.C_LOADED)), { type: MSG.C_LOADED });
  // Türkçe karakterli ad UTF-8 ile taşınır
  const r = decodeServer(encodeRoster(w, [{ slot: 3, id: 'p_0123456789abcdef01234567', name: 'Ömer Işık', tag: 4821, side: 1, flags: 2, kills: 7, deaths: 3, score: 820, ping: 48, party: 'pt_00aa11bb22cc33dd' }]));
  assert.equal(r.players[0].name, 'Ömer Işık');
  assert.equal(r.players[0].tag, 4821);
  assert.equal(r.players[0].party, 'pt_00aa11bb22cc33dd');
  assert.equal(r.players[0].id, 'p_0123456789abcdef01234567');
});

test('komutlar: nicemleme sınırları ve en çok üç komut', () => {
  const rnd = mulberry32(7);
  const cmds = [];
  for (let i = 0; i < 5; i++) {
    cmds.push({
      seq: 65534 + i, // u16 sarması
      buttons: (rnd() * 4096) | 0,
      moveX: rnd() * 2 - 1,
      moveY: rnd() * 2 - 1,
      yaw: (rnd() - 0.5) * 40, // sınırsız yaw (birçok tur)
      pitch: (rnd() - 0.5) * 3,
      slot: i & 1,
      fireMode: 2,
      viewTick: 1000 + i + 0.37,
      shots: i === 4 ? [{ yaw: 1, pitch: 0.1 }, { yaw: 1.01, pitch: 0.12 }] : [],
    });
  }
  const bytes = encodeInput(w, 777, cmds);
  assert.ok(bytes.length < 120, `${bytes.length} bayt`);
  const m = decodeClient(bytes);
  assert.equal(m.type, MSG.C_INPUT);
  assert.equal(m.ackTick, 777);
  assert.equal(m.cmds.length, 3);
  for (let i = 0; i < 3; i++) {
    const a = cmds[i + 2];
    const b = m.cmds[i];
    assert.equal(b.seq, a.seq & 0xffff);
    assert.equal(b.buttons, a.buttons);
    assert.ok(Math.abs(b.moveX - a.moveX) <= 0.5 / 127 + 1e-9);
    // yaw tam tura göre: açı farkı 1/65536 tur içinde
    const dy = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
    assert.ok(Math.abs(dy) <= Math.PI / 65536 + 1e-9);
    assert.ok(Math.abs(b.pitch - Math.max(-Math.PI / 2, Math.min(Math.PI / 2, a.pitch))) <= Math.PI / 2 / 32767 + 1e-9);
    assert.equal(b.slot, a.slot);
    assert.equal(b.fireMode, 2);
    assert.ok(Math.abs(b.viewTick - a.viewTick) <= 1 / 256);
  }
  assert.equal(m.cmds[2].shots.length, 2);
  // quantizeCmd kodlamayla aynı sayıları üretir (istemci tahmini sunucunun gördüğünü kullanır)
  const q = quantizeCmd({ ...cmds[3] });
  const back = decodeClient(encodeInput(w, 0, [cmds[3]])).cmds[0];
  assert.equal(q.yaw, back.yaw);
  assert.equal(q.pitch, back.pitch);
  assert.equal(q.moveX, back.moveX);
  assert.equal(q.moveY, back.moveY);
  assert.equal(decYaw(encYaw(-0.0001)), decYaw(65535));
  assert.equal(decPitch(encPitch(5)), Math.PI / 2);
});

test('anlık görüntü: yerel kayıt kayıpsız, uzak oyuncu 1/64 m', () => {
  const st = { pos: { x: 12.5 + 3 / 1024, y: 0.25, z: -30 + 1 / 1024 }, vel: { x: 6.5 + 1 / 256, y: -2, z: 0 }, crouchT: 517 / 1024, adsT: 1, sprintOut: 0.123, buttons: 1037, grounded: true, crouched: false, sprinting: true };
  const s = {
    tick: 123456,
    ackSeq: 4242,
    bufDepth: 2,
    tickUs: 812,
    phase: PHASE.LIVE,
    phaseLeft: 312.4,
    scoreA: 17,
    scoreB: 23,
    me: { alive: true, protect: true, hp: 73.2, respawnIn: 0, state: st },
    players: [{ slot: 4, flags: 1 | 4, pos: { x: -20.123, y: 1.5, z: 33.33 }, vel: { x: 3.3, y: 0, z: -1.25 }, yaw: 2.5, pitch: -0.3, crouchT: 0.5, hp: 50, weapon: 9 }],
    events: [
      { k: NEV.SHOT, slot: 4, weapon: 9, end: { x: 1, y: 2, z: 3 }, hit: 2, surface: 8 },
      { k: NEV.HIT, victim: 4, dmg: 72, flags: 3, point: { x: -20, y: 1.6, z: 33 } },
      { k: NEV.DAMAGE, attacker: 4, dmg: 30, from: { x: -20, y: 0, z: 33 } },
      { k: NEV.KILL, killer: 0, victim: 4, weapon: 254, flags: 1 },
      { k: NEV.SPAWN, slot: 4, pos: { x: 3, y: 0, z: -31 }, yaw: Math.PI },
      { k: NEV.RELOAD, slot: 2 },
      { k: NEV.ROUND, code: 2, value: 5 },
    ],
  };
  const d = decodeServer(encodeSnapshot(w, s));
  assert.equal(d.tick, s.tick);
  assert.equal(d.ackSeq, s.ackSeq);
  assert.equal(d.phaseLeft, 312.4);
  assert.equal(d.me.hp, 74);
  assert.ok(d.me.protect);
  assert.deepEqual(d.me.state.pos, st.pos);
  assert.deepEqual(d.me.state.vel, st.vel);
  assert.equal(d.me.state.crouchT, st.crouchT);
  assert.equal(d.me.state.buttons, st.buttons);
  assert.ok(Math.abs(d.me.state.sprintOut - st.sprintOut) < 1e-6);
  assert.equal(d.me.state.sprinting, true);
  const p = d.players[0];
  assert.ok(Math.abs(p.pos.x - -20.123) <= 1 / 128);
  assert.ok(Math.abs(p.vel.z - -1.25) <= 1 / 256);
  assert.equal(p.weapon, 9);
  assert.equal(d.events.length, 7);
  assert.deepEqual(d.events[4].pos, { x: 3, y: 0, z: -31 });
  assert.ok(Math.abs(d.events[4].yaw - Math.PI) < 1e-4);
  assert.equal(d.events[1].dmg, 72);
  assert.equal(d.events[3].weapon, 254);
  assert.deepEqual(d.events[6], { k: NEV.ROUND, code: 2, value: 5 });
  // Ölü oyuncunun kaydı yok
  const dead = decodeServer(encodeSnapshot(w, { ...s, me: { alive: false, hp: 0, respawnIn: 3.5, state: null }, events: [] }));
  assert.equal(dead.me.state, null);
  assert.equal(dead.me.respawnIn, 3.5);
});

test('sunucu iletileri: karşılama, pong, hata, maç sonu', () => {
  const wel = { slot: 2, tickRate: 64, snapshotRate: 32, serverTick: 99, serverTime: 1546.875, room: 'ABC234', mode: 'tdm', map: 'depo', timeLimit: 480, scoreLimit: 40, primary: 'k8', secondary: 'pistol' };
  assert.deepEqual(decodeServer(encodeWelcome(w, wel)), { type: MSG.S_WELCOME, ...wel });
  assert.deepEqual(decodeServer(encodePong(w, 5.5, 10.25, 7)), { type: MSG.S_PONG, clientTime: 5.5, serverTime: 10.25, serverTick: 7 });
  assert.deepEqual(decodeServer(encodeError(w, ERR.BUILD_MISMATCH, 'x')), { type: MSG.S_ERROR, code: ERR.BUILD_MISMATCH, detail: 'x' });
  assert.deepEqual(decodeServer(encodeMatchEnd(w, { winner: 1, reason: 2, scoreA: 30, scoreB: 40 })), { type: MSG.S_MATCH_END, winner: 1, reason: 2, scoreA: 30, scoreB: 40 });
});

test('bozuk iletiler null döner, istisna fırlatmaz', () => {
  const good = encodeInput(w, 1, [{ seq: 1, buttons: 0, moveX: 0, moveY: 1, yaw: 0, pitch: 0, slot: 0, fireMode: 0, viewTick: 0, shots: [] }]);
  assert.equal(decodeClient(good.slice(0, good.length - 1)), null, 'kısa');
  assert.equal(decodeClient(new Uint8Array([...good, 0])), null, 'fazla bayt');
  assert.equal(decodeClient(new Uint8Array([0x7f])), null, 'bilinmeyen tür');
  assert.equal(decodeClient(new Uint8Array([MSG.C_INPUT, 0, 0, 0, 0, 9])), null, 'çok komut');
  assert.equal(decodeClient(new Uint8Array(600).fill(2)), null, 'çok uzun');
  assert.equal(decodeClient(new Uint8Array(0)), null);
  assert.equal(decodeServer(new Uint8Array([MSG.S_SNAPSHOT, 1, 2])), null);
  // Rastgele çöp: hiçbiri istisna fırlatmaz
  const rnd = mulberry32(3);
  for (let i = 0; i < 2000; i++) {
    const n = 1 + ((rnd() * 80) | 0);
    const b = new Uint8Array(n);
    for (let j = 0; j < n; j++) b[j] = (rnd() * 256) | 0;
    b[0] = [MSG.C_HELLO, MSG.C_INPUT, MSG.C_PING, MSG.S_SNAPSHOT, MSG.S_ROSTER][i % 5];
    decodeClient(b);
    decodeServer(b);
  }
});
