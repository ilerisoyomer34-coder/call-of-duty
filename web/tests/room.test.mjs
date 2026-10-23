// Oyun odası ve maç simülasyonu (server/game/): sunucudaki hareket istemci tahminiyle bit düzeyinde aynı,
// komut bütçesi aşılamaz, gecikme telafisi oyuncunun gördüğü poza vurur, botlar maçı oynar, maç biter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CollisionWorld } from '../shared/sim/collision.js';
import { createPlayerState, clonePlayerState, stepPlayer, applyCmdMods, BTN } from '../shared/sim/movement.js';
import { TICK_DT } from '../shared/constants.js';
import { MSG, NEV, PHASE, SIDE } from '../shared/net/protocol.js';
import { Writer, encodeInput, decodeClient, decodeServer } from '../shared/net/codec.js';
import { mulberry32 } from '../shared/sim/rng.js';
import { WEAPONS, ONLINE } from '../src/config.js';
import { Room } from '../server/game/room.js';
import { MatchSim, eyeHeight, seqNewer } from '../server/game/sim.js';
import { modeRules } from '../server/game/rooms.js';
import ARENAS from '../src/data/arenas.json' with { type: 'json' };

const world = CollisionWorld.fromJSON(JSON.parse(readFileSync(new URL('../shared/maps/depo.collision.json', import.meta.url), 'utf8')));
const arena = ARENAS.depo;
const w = new Writer();

function fakeConn() {
  const got = [];
  return { got, transport: { send: (b) => got.push(decodeServer(b)), close() {} }, last: (type) => [...got].reverse().find((m) => m?.type === type) };
}

function makeRoom(kind = 'sandbox', mode = 'sandbox', rules = null) {
  let t = 0;
  const room = new Room({ code: 'TEST01', kind, mode, rules: rules || modeRules(mode === 'sandbox' ? 'sandbox' : mode), mapId: 'depo', world, arena, manual: true, now: () => t });
  room.advance = (n) => {
    for (let i = 0; i < n; i++) {
      t += 1000 / 64;
      room.tick();
    }
  };
  return room;
}

function joinHuman(room, id, side = SIDE.NONE, primary = 'rifle') {
  room.reserve([id], '', side);
  const c = fakeConn();
  assert.equal(room.canJoin(id), 0);
  assert.equal(room.join(c, { primary, secondary: 'pistol' }, { id, name: id, tag: 1 }), 0);
  room.onMessage(c, { type: MSG.C_LOADED });
  return c;
}

// Ağdan geçmiş gibi komut (kodla → çöz): sunucu ve tahmin aynı nicemli sayıları görür
function netCmds(cmds) {
  return decodeClient(encodeInput(w, 0, cmds)).cmds;
}

test('sunucu hareketi, aynı komutların tahminiyle bit düzeyinde aynı (yedekli paketler, silah değiştirme)', () => {
  const room = makeRoom();
  const c = joinHuman(room, 'p_a');
  room.advance(2);
  const p = room.sim.players[c.slot];
  assert.ok(p.alive, 'doğdu');
  const local = clonePlayerState(p.state, createPlayerState());
  const rnd = mulberry32(42);
  const all = [];
  for (let i = 0; i < 900; i++) {
    let b = 0;
    if (rnd() < 0.05) b |= BTN.JUMP;
    if (rnd() < 0.3) b |= BTN.CROUCH;
    if (rnd() < 0.4) b |= BTN.SPRINT;
    if (rnd() < 0.3) b |= BTN.ADS;
    if (rnd() < 0.05) b |= BTN.NO_ADS;
    all.push({ seq: i + 1, buttons: b, moveX: rnd() * 2 - 1, moveY: rnd() * 2 - 0.6, yaw: Math.sin(i * 0.01) * 3, pitch: 0, slot: i > 450 ? 1 : 0, fireMode: 0, viewTick: 0, shots: [] });
  }
  // Her pakette son 3 komut; sunucu her tick bir işler
  for (let i = 0; i < all.length; i++) {
    room.onMessage(c, { type: MSG.C_INPUT, ackTick: 0, cmds: netCmds(all.slice(Math.max(0, i - 2), i + 1)) });
    room.advance(1);
  }
  room.advance(4);
  assert.equal(p.lastSeq, 900);
  const loadout = p.loadout.map((id) => WEAPONS[id]);
  for (let i = 0; i < all.length; i++) {
    const cmd = netCmds([all[i]])[0];
    applyCmdMods(local.mods, cmd.buttons, loadout[cmd.slot]);
    stepPlayer(local, cmd, world, TICK_DT);
  }
  assert.equal(p.state.pos.x, local.pos.x);
  assert.equal(p.state.pos.y, local.pos.y);
  assert.equal(p.state.pos.z, local.pos.z);
  assert.equal(p.state.vel.x, local.vel.x);
  assert.equal(p.state.crouchT, local.crouchT);
  // Anlık görüntüdeki uzlaştırma kaydı aynı sayıları taşır
  const snap = c.last(MSG.S_SNAPSHOT);
  assert.equal(snap.ackSeq, 900);
  assert.equal(snap.me.state.pos.x, local.pos.x);
  assert.equal(snap.me.state.pos.z, local.pos.z);
});

test('komut bütçesi: bir anda gelen yığın gerçek zamandan hızlı işlenmez', () => {
  const room = makeRoom();
  const c = joinHuman(room, 'p_a');
  room.advance(2);
  const p = room.sim.players[c.slot];
  const count = () => Math.round(p.cmdT / TICK_DT);
  const start = count();
  const cmds = [];
  for (let i = 1; i <= 60; i++) cmds.push({ seq: i, buttons: 0, moveX: 0, moveY: 1, yaw: 0, pitch: 0, slot: 0, fireMode: 0, viewTick: 0, shots: [] });
  for (let i = 0; i < 60; i += 3) room.onMessage(c, { type: MSG.C_INPUT, ackTick: 0, cmds: netCmds(cmds.slice(i, i + 3)) });
  room.advance(10);
  const done = count() - start;
  assert.ok(done <= 10 + ONLINE.creditMax, `10 tick'te ${done} komut`);
  assert.ok(done >= 10, 'gecikmiş komutlar yine de işlenir');
  // Bekleyen kuyruk sınırlı (fazlası atılır)
  assert.ok(p.queue.length <= ONLINE.queueMax);
  assert.ok(seqNewer(5, 3) && !seqNewer(3, 5) && seqNewer(2, 65530));
});

test('gecikme telafisi: atış oyuncunun gördüğü (geçmiş) poza vurur; sınır dışı geçmişe vurmaz', () => {
  const room = makeRoom();
  const ca = joinHuman(room, 'p_a');
  const cb = joinHuman(room, 'p_b');
  room.advance(2);
  const sim = room.sim;
  const A = sim.players[ca.slot];
  const B = sim.players[cb.slot];
  // Açık alanda yerleştir: A (0, 18) kuzeye bakar, B 10 m ilerde
  A.state.pos.x = 0;
  A.state.pos.z = 18;
  B.state.pos.x = -4;
  B.state.pos.z = 8;
  let seqA = 0;
  let seqB = 0;
  const cmdA = (extra = {}) => ({ seq: ++seqA, buttons: BTN.ADS, moveX: 0, moveY: 0, yaw: 0, pitch: 0, slot: 0, fireMode: 0, viewTick: sim.tick, shots: [], ...extra });
  // Koruma bitsin, A nişana girsin; B sağa kaysın
  for (let i = 0; i < 160; i++) {
    room.onMessage(ca, { type: MSG.C_INPUT, ackTick: 0, cmds: netCmds([cmdA()]) });
    room.onMessage(cb, { type: MSG.C_INPUT, ackTick: 0, cmds: netCmds([{ seq: ++seqB, buttons: 0, moveX: i > 120 ? 1 : 0, moveY: 0, yaw: 0, pitch: 0, slot: 0, fireMode: 0, viewTick: 0, shots: [] }]) });
    room.advance(1);
  }
  assert.ok(B.state.pos.x > -3, `B kaydı (${B.state.pos.x})`);
  // A'nın gördüğü: 8 tick önceki B (≈125 ms)
  const seen = sim.tick - 8;
  const h = B.hist[seen % ONLINE.historyTicks];
  assert.equal(h.tick, seen);
  const eye = { x: A.state.pos.x, y: A.state.pos.y + eyeHeight(A.state), z: A.state.pos.z };
  const aim = (x, y, z) => {
    const dx = x - eye.x;
    const dy = y - eye.y;
    const dz = z - eye.z;
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  };
  const hits = () => ca.got.filter((m) => m?.type === MSG.S_SNAPSHOT).flatMap((s) => s.events).filter((e) => e.k === NEV.HIT && e.victim === cb.slot).length;
  // Geçmiş poza nişan + o anın görüntü zamanı → isabet
  const past = aim(h.x, h.y + 1.25, h.z);
  room.onMessage(ca, { type: MSG.C_INPUT, ackTick: 0, cmds: netCmds([cmdA({ viewTick: seen, shots: [past] })]) });
  room.advance(3);
  assert.equal(hits(), 1, 'geri sarılmış isabet');
  // Aynı yöne "şimdi" görüntüsüyle → B oradan çekildi, ıska
  for (let i = 0; i < 10; i++) {
    room.onMessage(ca, { type: MSG.C_INPUT, ackTick: 0, cmds: netCmds([cmdA()]) });
    room.advance(1);
  }
  room.onMessage(ca, { type: MSG.C_INPUT, ackTick: 0, cmds: netCmds([cmdA({ viewTick: sim.tick, shots: [past] })]) });
  room.advance(3);
  assert.equal(hits(), 1, 'güncel pozda ıska');
  // Çok eski görüntü (sınırın ötesi) kabul edilmez: en çok maxRewindMs geri
  const old = sim.tick - 40;
  room.onMessage(ca, { type: MSG.C_INPUT, ackTick: 0, cmds: netCmds([cmdA({ viewTick: old, shots: [past] })]) });
  room.advance(3);
  assert.equal(hits(), 1, 'sınır dışı geçmiş');
  // Saçılma tohumu sunucunun: aynı komut aynı sonucu verir, istemci bilemez
  assert.ok(A.arms.weapons[0].mag < WEAPONS.rifle.magSize);
});

test('atış doğrulaması: tempo ve şarjör sınırı, değiştirme süresi', () => {
  const room = makeRoom();
  const c = joinHuman(room, 'p_a');
  room.advance(2);
  const p = room.sim.players[c.slot];
  const w0 = p.arms.weapons[0];
  let seq = 0;
  const shots = (n) => Array.from({ length: n }, () => ({ yaw: 0, pitch: 0.5 }));
  // Bir tick'te 4 atış: tempo (720/dk ≈ 0,083 sn) en çok krediyi harcar
  room.onMessage(c, { type: MSG.C_INPUT, ackTick: 0, cmds: netCmds([{ seq: ++seq, buttons: 0, moveX: 0, moveY: 0, yaw: 0, pitch: 0, slot: 0, fireMode: 0, viewTick: 0, shots: shots(4) }]) });
  room.advance(1);
  const fired = WEAPONS.rifle.magSize - w0.mag;
  assert.ok(fired >= 1 && fired <= 3, `${fired} atış kabul`);
  // 3 saniyede 1000 atış isteği: en çok tempo kadarı
  for (let i = 0; i < 192; i++) {
    room.onMessage(c, { type: MSG.C_INPUT, ackTick: 0, cmds: netCmds([{ seq: ++seq, buttons: 0, moveX: 0, moveY: 0, yaw: 0, pitch: 0, slot: 0, fireMode: 0, viewTick: 0, shots: shots(4) }]) });
    room.advance(1);
  }
  assert.equal(w0.mag, 0, 'şarjör boşaldı');
  assert.ok(room.sim.players[c.slot].arms.weapons[0].reserve === WEAPONS.rifle.reserveStart);
  // Şarjör değiştirme süresi dolmadan atış yok, dolunca var
  room.onMessage(c, { type: MSG.C_INPUT, ackTick: 0, cmds: netCmds([{ seq: ++seq, buttons: BTN.RELOAD, moveX: 0, moveY: 0, yaw: 0, pitch: 0, slot: 0, fireMode: 0, viewTick: 0, shots: [] }]) });
  room.advance(1);
  room.onMessage(c, { type: MSG.C_INPUT, ackTick: 0, cmds: netCmds([{ seq: ++seq, buttons: 0, moveX: 0, moveY: 0, yaw: 0, pitch: 0, slot: 0, fireMode: 0, viewTick: 0, shots: shots(1) }]) });
  room.advance(1);
  assert.equal(w0.mag, 0, 'şarjör değişirken atış iptal (değiştirme kesildi)');
  room.onMessage(c, { type: MSG.C_INPUT, ackTick: 0, cmds: netCmds([{ seq: ++seq, buttons: BTN.RELOAD, moveX: 0, moveY: 0, yaw: 0, pitch: 0, slot: 0, fireMode: 0, viewTick: 0, shots: [] }]) });
  room.advance(1);
  for (let i = 0; i < 160; i++) {
    room.onMessage(c, { type: MSG.C_INPUT, ackTick: 0, cmds: netCmds([{ seq: ++seq, buttons: 0, moveX: 0, moveY: 0, yaw: 0, pitch: 0, slot: 0, fireMode: 0, viewTick: 0, shots: [] }]) });
    room.advance(1);
  }
  room.onMessage(c, { type: MSG.C_INPUT, ackTick: 0, cmds: netCmds([{ seq: ++seq, buttons: 0, moveX: 0, moveY: 0, yaw: 0, pitch: 0, slot: 0, fireMode: 0, viewTick: 0, shots: shots(1) }]) });
  room.advance(1);
  assert.equal(w0.mag, WEAPONS.rifle.magSize - 1, 'değiştirme sonrası dolu şarjör');
});

test('takım ölüm maçı: botlar doldurur, insan gelince bot çıkar, skor sınırında biter, sonuç gönderilir', () => {
  const rules = { ...modeRules('tdm'), warmup: 1, scoreLimit: 12 };
  const room = makeRoom('match', 'tdm', rules);
  const sim = room.sim;
  assert.equal(sim.players.filter((p) => p?.bot).length, 8, '4v4 botla dolu');
  const c = joinHuman(room, 'p_a', 0);
  assert.equal(sim.players.filter((p) => p?.bot && p.side === 0).length, 3, 'mavi taraftaki bot insana yer açtı');
  assert.equal(sim.players[c.slot].side, 0);
  room.advance(64 * 1.5);
  assert.equal(sim.phase, PHASE.LIVE);
  let ticks = 0;
  while (sim.phase === PHASE.LIVE && ticks < 64 * 400) {
    room.advance(64);
    ticks += 64;
  }
  assert.equal(sim.phase, PHASE.ENDED, 'botlar skor sınırına ulaştı');
  assert.equal(Math.max(...sim.scores), 12);
  const end = c.last(MSG.S_MATCH_END);
  assert.ok(end, 'maç sonu iletisi');
  assert.equal(end.winner, sim.scores[0] > sim.scores[1] ? 0 : 1);
  const roster = c.last(MSG.S_ROSTER);
  assert.equal(roster.players.length, 8);
  assert.ok(roster.players.some((p) => p.id === 'p_a' && !(p.flags & 1)));
  room.advance(64 * (ONLINE.endScreenSec + 1));
  assert.ok(room.closed, 'sonuç ekranından sonra oda kapanır');
});

test('ölüm maçı: herkes kendine, doğuşlar rakipten uzak, öldürme olayı ve yeniden doğma', () => {
  const sim = new MatchSim({ world, arena, rules: { ...modeRules('dm'), warmup: 0 }, mode: 'dm', seed: 9 });
  sim.balanceBots();
  assert.equal(sim.players.filter(Boolean).length, 6);
  let kills = 0;
  let spawns = 0;
  for (let i = 0; i < 64 * 90; i++) {
    sim.step();
    for (const e of sim.events) {
      if (e.k === NEV.KILL) kills++;
      if (e.k === NEV.SPAWN) {
        spawns++;
        // Doğduğu anda 4 m içinde rakip yok
        for (const q of sim.players) if (q && q.alive && q.slot !== e.slot) assert.ok(Math.hypot(q.state.pos.x - e.pos.x, q.state.pos.z - e.pos.z) > 4);
      }
    }
  }
  assert.ok(kills >= 8, `${kills} öldürme`);
  assert.ok(spawns >= 6 + kills - 6, 'ölenler yeniden doğdu');
});
