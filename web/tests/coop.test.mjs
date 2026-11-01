// Kampanya Co-op'u (server/game/coop.js, shared/sim/coop.js, data/coop.json): veri güncel ve geçerli, takım Alfa
// botlarıyla dolar, aşama düşmanları yerinde doğar ve yeniden doğmaz, clear/hold/reach/defend aşamaları ilerler,
// son aşamada görev tamam (maç sonucu takımın), süre dolunca başarısız; insan toplanma noktasında yeniden doğar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CollisionWorld } from '../shared/sim/collision.js';
import { createInputCmd, BTN } from '../shared/sim/movement.js';
import { NEV, PHASE, SIDE } from '../shared/net/protocol.js';
import { COOP_LEVELS, COOP_STATE, holdTarget, ACT_HOLD } from '../shared/sim/coop.js';
import { MatchSim } from '../server/game/sim.js';
import { modeRules } from '../server/game/rooms.js';
import { makeLevel } from '../tools/make-coop.mjs';
import { RoomManager, Matchmaker, isCampaign } from '../server/game/rooms.js';
import { Writer, encodeSnapshot, decodeServer } from '../shared/net/codec.js';
import { LEVELS, ONLINE } from '../src/config.js';
import { TICK_DT } from '../shared/constants.js';
import ARENAS from '../src/data/arenas.json' with { type: 'json' };

const worlds = new Map();
const worldOf = (map) => {
  if (!worlds.has(map)) worlds.set(map, CollisionWorld.fromJSON(JSON.parse(readFileSync(new URL(`../shared/maps/${map}.collision.json`, import.meta.url), 'utf8'))));
  return worlds.get(map);
};

function makeSim(level, over = {}) {
  const L = COOP_LEVELS[level];
  return new MatchSim({ world: worldOf(L.map), arena: ARENAS[L.map], rules: { ...modeRules('campaign'), warmup: 0.2, level, ...over }, mode: 'campaign', seed: 3 });
}
let seq = 0;
function cmd(p, buttons = 0) {
  const c = createInputCmd();
  c.seq = ++seq & 0xffff;
  c.buttons = buttons;
  c.yaw = p.state.yaw;
  c.pitch = 0;
  c.slot = 0;
  c.shots = [];
  p.queue.push(c);
}
function run(sim, sec, hold = new Map(), onEvent) {
  for (let i = 0; i < Math.round(sec / TICK_DT); i++) {
    for (const p of sim.players) if (p && !p.bot && p.alive && !p.queue.length) cmd(p, hold.get(p) || 0);
    sim.step();
    for (const e of sim.events) onEvent?.(e);
  }
}
function human(sim, id) {
  const slot = sim.addPlayer({ id, name: id, side: SIDE.BLUE, primary: 'ak74', secondary: 'pistol' });
  sim.setReady(slot);
  return sim.players[slot];
}
function place(p, x, z) {
  p.state.pos.x = x;
  p.state.pos.y = 0;
  p.state.pos.z = z;
  p.state.vel.x = p.state.vel.z = 0;
}

test('veri: coop.json üreticiyle güncel; her seviyede başlangıç ve son aşama, aşama türleri geçerli', () => {
  for (const L of LEVELS) {
    const made = makeLevel(L);
    assert.deepEqual(COOP_LEVELS[L.id], made, `seviye ${L.id} güncel (node tools/make-coop.mjs)`);
    assert.ok(made.start.length >= 4, `seviye ${L.id} başlangıç noktaları`);
    assert.ok(made.stages.at(-1).final);
    for (const s of made.stages) {
      assert.ok(['clear', 'hold', 'reach', 'defend'].includes(s.type));
      if (s.type === 'hold') assert.ok(s.targets.length > 0 && s.holdSec > 0);
      if (s.type === 'clear') assert.ok(s.enemies.length > 0);
    }
  }
});

test('başlangıç: takım Alfa botlarıyla dolar, ilk aşamanın düşmanları doğar, sınır aşılmaz', () => {
  const sim = makeSim('1');
  const a = human(sim, 'a');
  const ev = [];
  run(sim, 0.4, new Map(), (e) => ev.push(e));
  assert.equal(sim.phase, PHASE.LIVE);
  const team = sim.players.filter((p) => p && p.side === SIDE.BLUE);
  assert.equal(team.length, ONLINE.coop.teamSize);
  assert.ok(team.filter((p) => p.bot).every((p) => p.follow));
  const foes = sim.players.filter((p) => p && p.coopEnemy);
  assert.ok(foes.length > 0 && foes.length <= ONLINE.coop.maxEnemies);
  assert.ok(foes.every((p) => p.alive && p.home));
  const st = ev.find((e) => e.k === NEV.COOP);
  assert.ok(st && st.stage === 0 && st.state === COOP_STATE.ACTIVE);
  // Başlangıç noktasında
  const s0 = COOP_LEVELS['1'].start;
  assert.ok(s0.some(([x, z]) => Math.hypot(a.state.pos.x - x, a.state.pos.z - z) < 1));
});

test('clear: aşamanın bütün düşmanları ölünce sonraki aşama; düşman yeniden doğmaz, cesedi kalkar', () => {
  const sim = makeSim('1');
  const a = human(sim, 'a');
  run(sim, 0.4);
  const ev = [];
  for (let k = 0; k < 40 && sim.coop.stage === 0; k++) {
    const foe = sim.players.find((p) => p && p.coopEnemy && p.alive && p.stage === 0);
    if (foe) sim.kill(foe, a, 0, false);
    run(sim, 0.1, new Map(), (e) => ev.push(e));
  }
  assert.equal(sim.coop.stage, 1, 'ikinci aşamaya geçti');
  assert.ok(ev.some((e) => e.k === NEV.COOP && e.state === COOP_STATE.DONE && e.stage === 0));
  const dead = sim.players.filter((p) => p && p.coopEnemy && !p.alive);
  run(sim, ONLINE.corpseSec + 0.5);
  assert.ok(dead.length && dead.every((p) => !sim.players.includes(p)), 'cesetler kalktı');
  assert.ok(dead.every((p) => !p.alive), 'ölen doğmadı');
});

test('hold + reach: hedefin dibinde E basılı (yerinde) hedef biter; son noktaya varınca görev tamam, sonuç takımın', () => {
  const sim = makeSim('2');
  const a = human(sim, 'a');
  run(sim, 0.4);
  // Muhafızlar hedefin başındaki oyuncuyu vurmasın (yalnız hedef kuralı denenir)
  a.protectUntil = Infinity;
  const st = sim.coop.stageDef;
  const si = sim.coop.stage;
  assert.equal(st.type, 'hold');
  const hold = new Map([[a, BTN.USE]]);
  for (const [k, t] of st.targets.entries()) {
    place(a, t[0] + 0.5, t[1]);
    assert.equal(holdTarget(st, sim.coop.done, a.state.pos.x, a.state.pos.z, true), k);
    run(sim, st.holdSec * 0.5, hold);
    assert.equal(a.useKind, ACT_HOLD);
    run(sim, st.holdSec * 0.6 + 0.1, hold);
    // Son hedef bitince aşama ilerler (bitenler listesi yeni aşamada boşalır)
    assert.ok(sim.coop.done[k] || sim.coop.stage > si, `hedef ${k} bitti`);
  }
  run(sim, 0.1);
  assert.equal(sim.coop.stageDef.type, 'reach');
  const fin = sim.coop.stageDef;
  place(a, fin.pos[0], fin.pos[1]);
  run(sim, 0.2);
  assert.equal(sim.phase, PHASE.ENDED);
  assert.ok(sim.coop.success);
  assert.equal(sim.result.winner, SIDE.BLUE);
});

test('ölen insan toplanma noktasında doğar; süre dolunca görev başarısız', () => {
  const sim = makeSim('1', { timeLimit: 3, respawn: 1 });
  const a = human(sim, 'a');
  run(sim, 0.4);
  const foe = sim.players.find((p) => p && p.coopEnemy);
  sim.kill(a, foe, 0, false);
  run(sim, 1.3);
  assert.ok(a.alive, 'yeniden doğdu');
  run(sim, 3);
  assert.equal(sim.phase, PHASE.ENDED);
  assert.ok(!sim.coop.success);
  assert.equal(sim.result.winner, SIDE.RED);
});

test('defend: savunma süresince dalgalar doğar ve iniş bölgesine yürür', () => {
  const sim = makeSim('3');
  human(sim, 'a');
  run(sim, 0.4);
  const D = COOP_LEVELS['3'].stages.findIndex((s) => s.type === 'defend');
  // Önceki aşamaları hızla bitir: düşmanları öldür, hedefleri işaretle, noktaya ışınla
  const a = sim.players.find((p) => p && !p.bot);
  for (let guard = 0; guard < 400 && sim.coop.stage < D; guard++) {
    const st = sim.coop.stageDef;
    if (st.type === 'clear') {
      const f = sim.players.find((p) => p && p.coopEnemy && p.alive && p.stage === sim.coop.stage);
      if (f) sim.kill(f, a, 0, false);
    } else if (st.type === 'hold') st.targets.forEach((_, k) => (sim.coop.done[k] = true));
    else if (st.type === 'reach') place(a, st.pos[0], st.pos[1]);
    run(sim, 0.1);
  }
  assert.equal(sim.coop.stageDef.type, 'defend');
  const before = sim.players.filter((p) => p && p.coopEnemy).length;
  run(sim, 30);
  const waveFoes = sim.players.filter((p) => p && p.coopEnemy && p.home && Math.hypot(p.home.x - sim.coop.stageDef.pos[0], p.home.z - sim.coop.stageDef.pos[1]) < 0.1);
  assert.ok(waveFoes.length > 0 || sim.players.filter((p) => p && p.coopEnemy).length > before, 'dalga doğdu');
});

test('takım dengesi: insan katılınca bir Alfa botu çıkar, ayrılınca geri gelir', () => {
  const sim = makeSim('1');
  human(sim, 'a');
  run(sim, 0.4);
  const alfa = () => sim.players.filter((p) => p && p.follow).length;
  assert.equal(alfa(), ONLINE.coop.teamSize - 1);
  const b = human(sim, 'b');
  sim.balanceBots();
  assert.equal(alfa(), ONLINE.coop.teamSize - 2);
  const names = sim.players.filter((p) => p && p.follow).map((p) => p.name);
  assert.equal(new Set(names).size, names.length, 'Alfa adları tekrar etmez');
  sim.removePlayer(b.slot);
  sim.balanceBots();
  assert.equal(alfa(), ONLINE.coop.teamSize - 1);
});

test('ağ: aşama olayı ve anlık görüntü (skor: biten aşama / toplam, hedefte E ilerlemesi) gidip gelir', () => {
  const sim = makeSim('2');
  const a = human(sim, 'a');
  run(sim, 0.4);
  a.protectUntil = Infinity;
  const st = sim.coop.stageDef;
  place(a, st.targets[0][0], st.targets[0][1]);
  run(sim, 1, new Map([[a, BTN.USE]]));
  const snap = sim.snapshotFor(a.slot);
  snap.events = [{ k: NEV.COOP, stage: 0, state: COOP_STATE.ACTIVE, left: 2, mask: 1 }];
  const d = decodeServer(encodeSnapshot(new Writer(4096), snap));
  assert.equal(d.scoreA, 0);
  assert.equal(d.scoreB, COOP_LEVELS['2'].stages.length);
  assert.equal(d.me.act, ACT_HOLD);
  assert.ok(d.me.actProgress > 0.2 && d.me.actProgress < 0.5);
  assert.deepEqual(d.events[0], { k: NEV.COOP, stage: 0, state: COOP_STATE.ACTIVE, left: 2, mask: 1 });
});

test('oda: kampanya seviyenin haritasında açılır, eşleştirme kuyruğu kampanyayı almaz', () => {
  const rm = new RoomManager({ overrides: {} });
  const room = rm.create('campaign', 'campaign', null, '7');
  assert.equal(room.mapId, COOP_LEVELS['7'].map);
  assert.equal(room.sim.coop.levelId, '7');
  room.close('test');
  assert.ok(isCampaign('campaign') && !isCampaign('tdm'));
  const mm = new Matchmaker({ rooms: rm, hub: { isOnline: () => true, send() {} }, parties: { partyOf: () => null } });
  assert.deepEqual(mm.enqueue('a', 'campaign'), { error: 'bad_mode' });
  mm.close();
});

test('botlar: düşman insan yokken evinin yakınında kalır, Alfa botu insanın yanına gelir', () => {
  const sim = makeSim('3');
  const a = human(sim, 'a');
  run(sim, 0.4);
  a.protectUntil = Infinity;
  run(sim, 20);
  const C = ONLINE.coop;
  // İnsanın evine aggro'dan uzak olduğu muhafızlar evinin dolayında
  const far = sim.players.filter((p) => p && p.coopEnemy && p.alive && Math.hypot(p.home.x - a.state.pos.x, p.home.z - a.state.pos.z) > C.aggro + 20);
  assert.ok(far.length > 0);
  for (const p of far) assert.ok(Math.hypot(p.state.pos.x - p.home.x, p.state.pos.z - p.home.z) < C.leash, `${p.name} evinin yakınında`);
  // Alfa botları insanın çevresinde (kovalamada uzaklaşsa da geri gelir)
  const alfa = sim.players.filter((p) => p && p.follow && p.alive);
  assert.ok(alfa.some((p) => Math.hypot(p.state.pos.x - a.state.pos.x, p.state.pos.z - a.state.pos.z) < C.followNear + C.followDist + 2));
});
