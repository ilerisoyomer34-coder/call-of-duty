// Seri ödülleri (shared/sim/streaks.js, server/game/sim.js) ve maç sonucu istatistikleri (room.results,
// db.recordMatch): eşikler, ölünce seri sıfırlanır ama ödül kalır, kullanım (hedef ışını, patlama planı, öldürme
// ödülün silahıyla, takım arkadaşı yaralanmaz, ödül öldürmesi seriyi büyütmez), Rekabetçide yok; sonuç kaydı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CollisionWorld } from '../shared/sim/collision.js';
import { createInputCmd } from '../shared/sim/movement.js';
import { NEV, SIDE, PHASE, WEAPON_AIRSTRIKE, BLAST_STRIKE, MSG } from '../shared/net/protocol.js';
import { STREAKS, STREAK_INDEX, streakBits, streakFromBits, earnedAt, strikePlan } from '../shared/sim/streaks.js';
import { Writer, encodeSnapshot, decodeServer } from '../shared/net/codec.js';
import { Rng } from '../shared/sim/rng.js';
import { MatchSim } from '../server/game/sim.js';
import { Room } from '../server/game/room.js';
import { modeRules } from '../server/game/rooms.js';
import { Store } from '../server/db.js';
import { TICK_DT } from '../shared/constants.js';
import { ONLINE } from '../src/config.js';
import ARENAS from '../src/data/arenas.json' with { type: 'json' };

const world = CollisionWorld.fromJSON(JSON.parse(readFileSync(new URL('../shared/maps/depo.collision.json', import.meta.url), 'utf8')));
const AIR = STREAK_INDEX.airstrike;

function makeSim(mode = 'tdm') {
  return new MatchSim({ world, arena: ARENAS.depo, rules: { ...modeRules(mode), warmup: 0, bots: 'none' }, mode, seed: 9 });
}
function human(sim, id, side) {
  const slot = sim.addPlayer({ id, name: id, side, primary: 'ak74', secondary: 'pistol' });
  sim.setReady(slot);
  return sim.players[slot];
}
function place(p, x, z, yaw = 0) {
  p.state.pos.x = x;
  p.state.pos.y = 0;
  p.state.pos.z = z;
  p.state.vel.x = p.state.vel.z = 0;
  p.state.yaw = yaw;
}
let seq = 0;
function cmd(p, buttons = 0, pitch = 0, yaw = p.state.yaw) {
  const c = createInputCmd();
  c.seq = ++seq & 0xffff;
  c.buttons = buttons;
  c.yaw = yaw;
  c.pitch = pitch;
  c.slot = 0;
  c.shots = [];
  p.queue.push(c);
}
function run(sim, sec, onEvent) {
  for (let i = 0; i < Math.round(sec / TICK_DT); i++) {
    for (const p of sim.players) if (p && !p.bot && p.alive && !p.queue.length) cmd(p);
    sim.step();
    for (const e of sim.events) onEvent?.(e);
  }
}

test('kurallar: eşikler, komut bitleri, hava saldırısı hattı, topçu tohumlu', () => {
  assert.deepEqual(STREAKS.map((s) => s.kills), [3, 5, 8]);
  assert.deepEqual(earnedAt(5), [AIR]);
  assert.deepEqual(earnedAt(4), []);
  for (let i = 0; i < STREAKS.length; i++) assert.equal(streakFromBits(streakBits(i) | 4096), i);
  assert.equal(streakFromBits(4096), -1);
  const line = strikePlan(AIR, { x: 0, z: 0 }, 0, new Rng(1));
  assert.equal(line.length, STREAKS[AIR].count);
  // yaw 0 → -Z yönünde sıralı, ortası hedefte
  assert.ok(line.every((b) => Math.abs(b.x) < 1e-9));
  assert.ok(Math.abs(line[Math.floor(line.length / 2)].z) < 1e-9);
  const a = strikePlan(STREAK_INDEX.artillery, { x: 5, z: 5 }, 0, new Rng(7));
  const b = strikePlan(STREAK_INDEX.artillery, { x: 5, z: 5 }, 0, new Rng(7));
  assert.deepEqual(a, b, 'aynı tohum aynı plan');
  assert.ok(a.every((p) => Math.hypot(p.x - 5, p.z - 5) <= STREAKS[STREAK_INDEX.artillery].spread + 1e-9));
});

test('seri: 3/5/8 öldürmede hazır, ölünce seri sıfırlanır ama ödül kalır; anlık görüntüde', () => {
  const sim = makeSim();
  const a = human(sim, 'a', SIDE.BLUE);
  const b = human(sim, 'b', SIDE.RED);
  run(sim, 0.1);
  sim.events.length = 0;
  for (let i = 0; i < 5; i++) {
    b.alive = true;
    b.hp = 100;
    sim.kill(b, a, 0, i === 0);
  }
  const ev = [...sim.events];
  assert.equal(a.streak, 5);
  assert.equal(a.headshots, 1);
  assert.equal(a.streakReady, 0b011);
  const ready = ev.filter((e) => e.k === NEV.STREAK && e.state === 0);
  assert.deepEqual(ready.map((e) => e.kind), [0, 1]);
  assert.ok(ready.every((e) => e.to === a.slot), 'hazır olayı yalnız sahibine');
  sim.kill(a, b, 0, false);
  assert.equal(a.streak, 0);
  assert.equal(a.bestStreak, 5);
  assert.equal(a.streakReady, 0b011, 'ödül ölünce kalır');
  const snap = decodeServer(encodeSnapshot(new Writer(4096), { ...sim.snapshotFor(a.slot), events: [] }));
  assert.equal(snap.me.streak, 0);
  assert.equal(snap.me.streakReady, 0b011);
});

test('hava saldırısı: nişangâhın gösterdiği yere hat, rakip ölür (ödülün silahıyla), takım arkadaşı yaralanmaz, ödül öldürmesi seriyi büyütmez', () => {
  const sim = makeSim();
  const a = human(sim, 'a', SIDE.BLUE);
  const mate = human(sim, 'm', SIDE.BLUE);
  const foe = human(sim, 'f', SIDE.RED);
  run(sim, 2.5); // doğuş koruması
  place(a, 0, 20, 0); // -Z'ye bakar
  // Nişangâhın gösterdiği yer: aynı ışınla (araya siper girerse onun üstü); rakip orada, takım arkadaşı yanında
  const pitch = -Math.atan2(1.6, 10);
  const tgt = sim.streakTarget(a, { yaw: 0, pitch }, STREAKS[AIR].range);
  place(foe, tgt.x, tgt.z);
  place(mate, tgt.x + 1.5, tgt.z);
  a.streakReady = 1 << AIR;
  const kills = a.kills;
  cmd(a, streakBits(AIR), pitch, 0);
  const ev = [];
  run(sim, STREAKS[AIR].delay + 1.5, (e) => ev.push(e));
  const used = ev.find((e) => e.k === NEV.STREAK && e.state === 1);
  assert.ok(used && used.kind === AIR && used.slot === a.slot);
  assert.ok(Math.hypot(used.pos.x - tgt.x, used.pos.z - tgt.z) < 0.1, `hedef nişangâhın yeri (${used.pos.x.toFixed(1)}, ${used.pos.z.toFixed(1)})`);
  assert.equal(a.streakReady, 0, 'kullanılan ödül gider');
  assert.equal(ev.filter((e) => e.k === NEV.BLAST && e.kind === BLAST_STRIKE).length, STREAKS[AIR].count);
  const kill = ev.find((e) => e.k === NEV.KILL && e.victim === foe.slot);
  assert.ok(kill && kill.killer === a.slot && kill.weapon === WEAPON_AIRSTRIKE, 'rakip ödülle öldü');
  assert.equal(mate.hp, ONLINE.hp, 'takım arkadaşı tam can');
  assert.equal(a.kills, kills + 1);
  assert.equal(a.streak, 0, 'ödül öldürmesi seriyi büyütmez');
  assert.equal(a.streaksUsed, 1);
  // Hazır olmayan ödül kullanılamaz
  cmd(a, streakBits(AIR), -0.2);
  const ev2 = [];
  run(sim, 0.2, (e) => ev2.push(e));
  assert.ok(!ev2.some((e) => e.k === NEV.STREAK));
});

test('Rekabetçide seri ödülü yok', () => {
  const sim = new MatchSim({ world, arena: ARENAS.depo, rules: { ...modeRules('competitive'), warmup: 0.1, bots: 'none' }, mode: 'competitive', seed: 2 });
  const a = human(sim, 'a', SIDE.BLUE);
  const b = human(sim, 'b', SIDE.RED);
  run(sim, 0.3);
  for (let i = 0; i < 4; i++) {
    b.alive = true;
    sim.kill(b, a, 0, false);
  }
  assert.equal(a.streakReady, 0);
  assert.equal(a.bestStreak, 4, 'istatistik için seri yine sayılır');
});

test('maç sonucu: oda insanların sonucunu kalıcı istatistiğe yazar (kazanan, XP, en iyi seri)', () => {
  let t = 0;
  const store = new Store(':memory:');
  const pa = store.createPlayer('Kaan');
  const pb = store.createPlayer('Lale');
  const room = new Room({
    code: 'STAT01',
    kind: 'match',
    mode: 'tdm',
    rules: { ...modeRules('tdm'), warmup: 0, bots: 'none', timeLimit: 2 },
    mapId: 'depo',
    world,
    arena: ARENAS.depo,
    manual: true,
    now: () => t,
    onResults: (list) => {
      for (const { id, record } of list) store.recordMatch(id, record);
    },
  });
  const conns = [];
  for (const [p, side] of [
    [pa, SIDE.BLUE],
    [pb, SIDE.RED],
  ]) {
    room.reserve([p.id], '', side);
    const c = { got: [], transport: { send: () => {}, close() {} } };
    room.join(c, { primary: 'ak74', secondary: 'pistol' }, { id: p.id, name: p.name, tag: 1 });
    room.onMessage(c, { type: MSG.C_LOADED });
    conns.push(c);
  }
  const advance = (n) => {
    for (let i = 0; i < n; i++) {
      t += 1000 / 64;
      room.tick();
    }
  };
  advance(10);
  const A = room.sim.players[conns[0].slot];
  const B = room.sim.players[conns[1].slot];
  for (let i = 0; i < 3; i++) {
    B.alive = true;
    room.sim.kill(B, A, 0, i < 2);
  }
  advance(64 * 3);
  assert.equal(room.sim.phase, PHASE.ENDED);
  const sa = store.stats(pa.id);
  const sb = store.stats(pb.id);
  assert.equal(sa.matches, 1);
  assert.equal(sa.wins, 1);
  assert.equal(sa.kills, 3);
  assert.equal(sa.headshots, 2);
  assert.equal(sa.best_streak, 3);
  assert.equal(sa.xp, A.score + ONLINE.xpMatch + ONLINE.xpWin);
  assert.equal(sb.losses, 1);
  assert.equal(sb.deaths, 3);
  assert.equal(sb.xp, ONLINE.xpMatch);
  assert.equal(sa.history.length, 1);
  assert.equal(sa.history[0].result, 'win');
  assert.equal(sa.history[0].map, 'depo');
  store.close();
});
