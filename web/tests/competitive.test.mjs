// Rekabetçi mod (server/game/comp.js, shared/sim/competitive.js): raunt akışı, satın alma, bomba kurma / imha /
// patlama, yok etme, süre, para (öldürme, raunt, art arda kayıp), yarı değişimi, maç sonu, raunt içinde doğuş yok,
// bomba taşıyan ölünce yere düşer ve alınır; botlar kendi başına raunt oynar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CollisionWorld } from '../shared/sim/collision.js';
import { createInputCmd, BTN } from '../shared/sim/movement.js';
import { NEV, PHASE, SIDE } from '../shared/net/protocol.js';
import { COMP_RULES as C, ROUND_STATE, ROUND_REASON, BOMB, ACT, BUY_ITEMS, buyIndex, priceOf, roundReward, siteAt, actionFor } from '../shared/sim/competitive.js';
import { Writer, encodeSnapshot, decodeServer, encodeBuy, decodeClient } from '../shared/net/codec.js';
import { MatchSim } from '../server/game/sim.js';
import { modeRules } from '../server/game/rooms.js';
import { TICK_DT } from '../shared/constants.js';
import ARENAS from '../src/data/arenas.json' with { type: 'json' };

const world = CollisionWorld.fromJSON(JSON.parse(readFileSync(new URL('../shared/maps/depo.collision.json', import.meta.url), 'utf8')));
const arena = ARENAS.depo;

function makeSim(over = {}) {
  const rules = { ...modeRules('competitive'), warmup: 0.5, bots: 'none', ...over };
  return new MatchSim({ world, arena, rules, mode: 'competitive', seed: 7 });
}

let seq = 0;
function cmd(p, buttons = 0, mx = 0, my = 0) {
  const c = createInputCmd();
  c.seq = ++seq & 0xffff;
  c.buttons = buttons;
  c.moveX = mx;
  c.moveY = my;
  c.yaw = p.state.yaw;
  c.pitch = 0;
  c.slot = 0;
  c.shots = [];
  p.queue.push(c);
}

// Her tick her insana bir komut (gerçek istemci gibi); hold: oyuncu → düğmeler
function run(sim, sec, hold = new Map(), onEvent) {
  for (let i = 0; i < Math.round(sec / TICK_DT); i++) {
    for (const p of sim.players) if (p && !p.bot && !p.queue.length) cmd(p, hold.get(p) || 0);
    sim.step();
    for (const e of sim.events) onEvent?.(e);
  }
}

function human(sim, id, side) {
  const slot = sim.addPlayer({ id, name: id, side, primary: 'ak74', secondary: 'pistol' });
  sim.setReady(slot);
  return sim.players[slot];
}

function place(p, x, z) {
  p.state.pos.x = x;
  p.state.pos.y = 0;
  p.state.pos.z = z;
  p.state.vel.x = p.state.vel.y = p.state.vel.z = 0;
}

// Isınma biter, satın alma başlar
function toBuy(sim) {
  run(sim, 0.6);
  assert.equal(sim.phase, PHASE.BUY);
}
function toLive(sim) {
  run(sim, sim.phaseLeft + 0.05);
  assert.equal(sim.phase, PHASE.LIVE);
}

test('kurallar: fiyat listesi, para, bölge, eylem koşulu', () => {
  assert.ok(BUY_ITEMS.length > 10);
  assert.ok(BUY_ITEMS.every((it, i) => i === 0 || it.kind !== 'weapon' || it.price >= BUY_ITEMS[i - 1].price), 'fiyat sırası');
  assert.equal(priceOf('awm'), C.prices.weapons.awm);
  assert.equal(priceOf('pistol'), null, 'tabanca satılmaz');
  assert.equal(BUY_ITEMS[buyIndex('frag')].price, C.prices.frag);
  assert.equal(roundReward(true, 0), C.money.win);
  assert.equal(roundReward(false, 1), C.money.lose[0]);
  assert.equal(roundReward(false, 99), C.money.lose.at(-1));
  assert.equal(arena.sites.length, 2);
  const [sx, sz] = arena.sites[0];
  assert.equal(siteAt(arena.sites, sx, sz), 0);
  assert.equal(siteAt(arena.sites, 0, -31), -1);
  const c = { live: true, attackSide: SIDE.RED, bomb: { state: BOMB.CARRIED, carrier: 3, x: 0, z: 0 }, sites: arena.sites };
  assert.equal(actionFor({ slot: 3, side: SIDE.RED, alive: true, x: sx, z: sz, grounded: true }, c), ACT.PLANT);
  assert.equal(actionFor({ slot: 4, side: SIDE.RED, alive: true, x: sx, z: sz, grounded: true }, c), ACT.NONE, 'bombası olmayan kuramaz');
  assert.equal(actionFor({ slot: 3, side: SIDE.RED, alive: true, x: 0, z: -31, grounded: true }, c), ACT.NONE, 'bölge dışı');
  const pl = { ...c, bomb: { state: BOMB.PLANTED, carrier: 255, x: sx, z: sz } };
  assert.equal(actionFor({ slot: 1, side: SIDE.BLUE, alive: true, x: sx + 1, z: sz, grounded: true }, pl), ACT.DEFUSE);
  assert.equal(actionFor({ slot: 1, side: SIDE.BLUE, alive: true, x: sx + 3, z: sz, grounded: true }, pl), ACT.NONE);
});

test('raunt akışı: ısınma → satın alma (hareket yok) → raunt; bomba saldırana, para başlangıçta', () => {
  const sim = makeSim();
  const r = human(sim, 'r', SIDE.RED);
  const b = human(sim, 'b', SIDE.BLUE);
  const ev = [];
  run(sim, 0.6, new Map(), (e) => ev.push(e));
  assert.equal(sim.phase, PHASE.BUY);
  assert.ok(sim.frozen, 'satın almada hareket yok');
  assert.equal(sim.comp.round, 1);
  assert.equal(sim.comp.attackSide, SIDE.RED);
  assert.equal(r.money, C.money.start);
  assert.equal(sim.comp.bomb.state, BOMB.CARRIED);
  assert.equal(sim.comp.bomb.carrier, r);
  const rs = ev.find((e) => e.k === NEV.ROUND_STATE);
  assert.ok(rs && rs.state === ROUND_STATE.BUY && rs.round === 1);
  assert.ok(ev.some((e) => e.k === NEV.BOMB && e.state === BOMB.CARRIED && e.slot === r.slot));
  // Saldıran kırmızı doğuşta, savunan mavide
  assert.ok(r.state.pos.z < 0 && b.state.pos.z > 0, 'rol doğuşları');
  assert.equal(r.arms.weapons.length, 1, 'ilk raunt yalnız tabanca');
  toLive(sim);
  assert.ok(!sim.frozen);
  assert.ok(Math.abs(sim.phaseLeft - C.rounds.roundSec) < 0.1);
});

test('satın alma: yalnız satın alma evresinde, para yetiyorsa; silah hemen elde, bomba sınırı', () => {
  const sim = makeSim();
  const r = human(sim, 'r', SIDE.RED);
  human(sim, 'b', SIDE.BLUE);
  toBuy(sim);
  const smg = buyIndex('smg');
  assert.equal(sim.comp.buy(r, smg, []), false, '800 ile taramalı alınmaz');
  assert.equal(sim.comp.buy(r, buyIndex('frag'), []), true);
  assert.equal(sim.comp.buy(r, buyIndex('frag'), []), false, 'raunt başına bir el bombası');
  assert.equal(r.money, C.money.start - C.prices.frag);
  assert.equal(r.nadeCount[0], 1);
  r.money = 5000;
  assert.equal(sim.comp.buy(r, buyIndex('ak74'), []), true);
  assert.equal(r.money, 5000 - priceOf('ak74'));
  assert.deepEqual(r.arms.weapons.map((w) => w.id), ['ak74', 'pistol']);
  // Teçhizat olayı alıcıya: ana silah, tabanca, bombalar
  run(sim, TICK_DT);
  toLive(sim);
  assert.equal(sim.comp.buy(r, buyIndex('smoke'), []), false, 'raunt başlayınca satın alma yok');
  // İleti biçimi
  const m = decodeClient(encodeBuy(new Writer(64), { item: smg, mods: [1, 2] }));
  assert.equal(m.item, smg);
  assert.deepEqual(m.mods, [1, 2]);
});

test('bomba: bölgede E basılı kurulur (hareket başa döndürür), sayaç bomba süresi; imha savunana raundu verir', () => {
  const sim = makeSim();
  const r = human(sim, 'r', SIDE.RED);
  const b = human(sim, 'b', SIDE.BLUE);
  toBuy(sim);
  toLive(sim);
  const [sx, sz] = arena.sites[1];
  place(r, sx, sz);
  place(b, sx + 1, sz + 0.5);
  const ev = [];
  const hold = new Map([[r, BTN.USE]]);
  run(sim, C.bomb.plantSec * 0.5, hold, (e) => ev.push(e));
  assert.equal(r.useKind, ACT.PLANT);
  // Hareket: ilerleme başa döner
  r.state.vel.x = 3;
  run(sim, TICK_DT * 2, hold);
  assert.ok(r.useT < C.bomb.plantSec * 0.5);
  run(sim, C.bomb.plantSec + 0.3, hold, (e) => ev.push(e));
  assert.equal(sim.comp.bomb.state, BOMB.PLANTED);
  assert.equal(sim.comp.bomb.site, 1);
  assert.ok(ev.some((e) => e.k === NEV.BOMB && e.state === BOMB.PLANTED && e.site === 1));
  assert.ok(Math.abs(sim.phaseLeft - C.bomb.timerSec) < 0.3, 'sayaç bombanın');
  assert.equal(r.money, C.money.start + C.money.plant);
  // Saldıran ölse de raunt bitmez (bomba kurulu)
  sim.kill(r, b, 0, false);
  sim.comp.update();
  assert.equal(sim.comp.state, ROUND_STATE.LIVE);
  // İmha
  const snap = decodeServer(encodeSnapshot(new Writer(4096), { ...sim.snapshotFor(b.slot), events: [] }));
  assert.equal(snap.me.money, b.money);
  hold.set(b, BTN.USE);
  run(sim, C.bomb.defuseSec * 0.5, hold);
  const mid = decodeServer(encodeSnapshot(new Writer(4096), { ...sim.snapshotFor(b.slot), events: [] }));
  assert.equal(mid.me.act, ACT.DEFUSE);
  assert.ok(mid.me.actProgress > 0.3 && mid.me.actProgress < 0.7, `imha ilerlemesi ${mid.me.actProgress}`);
  run(sim, C.bomb.defuseSec, hold, (e) => ev.push(e));
  assert.equal(sim.comp.bomb.state, BOMB.DEFUSED);
  assert.equal(sim.comp.state, ROUND_STATE.POST);
  assert.equal(sim.comp.winner, SIDE.BLUE);
  assert.equal(sim.comp.reason, ROUND_REASON.DEFUSE);
  assert.equal(sim.scores[SIDE.BLUE], 1);
  assert.equal(sim.phase, PHASE.ROUND_END);
  // Raunt sonu parası: kazanan win (+ öldürme, imha), kaybeden saldıran lose[0] + bomba kurma payı
  assert.equal(b.money, C.money.start + C.money.kill.default + C.money.defuse + C.money.win);
  assert.equal(r.money, C.money.start + C.money.plant + C.money.lose[0] + C.money.plantedLoss);
});

test('bomba patlar: saldıran kazanır, yakındakiler ölür; süre dolunca savunan kazanır', () => {
  const sim = makeSim();
  const r = human(sim, 'r', SIDE.RED);
  const b = human(sim, 'b', SIDE.BLUE);
  toBuy(sim);
  toLive(sim);
  const [sx, sz] = arena.sites[0];
  place(r, sx, sz);
  run(sim, C.bomb.plantSec + 0.2, new Map([[r, BTN.USE]]));
  assert.equal(sim.comp.bomb.state, BOMB.PLANTED);
  place(b, sx + 2, sz);
  run(sim, C.bomb.timerSec + 0.2);
  assert.equal(sim.comp.bomb.state, BOMB.EXPLODED);
  assert.equal(sim.comp.winner, SIDE.RED);
  assert.equal(sim.comp.reason, ROUND_REASON.BOMB);
  assert.ok(!b.alive, 'yakındaki savunan öldü');
  // Sonraki raunt: süre dolar → savunan
  run(sim, C.rounds.postSec + 0.1);
  assert.equal(sim.phase, PHASE.BUY);
  assert.equal(sim.comp.round, 2);
  assert.ok(r.alive && b.alive, 'herkes raunt başında doğar');
  toLive(sim);
  run(sim, C.rounds.roundSec + 0.2);
  assert.equal(sim.comp.winner, SIDE.BLUE);
  assert.equal(sim.comp.reason, ROUND_REASON.TIME);
  assert.deepEqual(sim.scores, [1, 1]);
});

test('yok etme, raunt içinde doğuş yok, bomba düşer ve alınır, art arda kayıp parası', () => {
  const sim = makeSim();
  const r1 = human(sim, 'r1', SIDE.RED);
  const r2 = human(sim, 'r2', SIDE.RED);
  const b = human(sim, 'b', SIDE.BLUE);
  toBuy(sim);
  toLive(sim);
  const carrier = sim.comp.bomb.carrier;
  const other = carrier === r1 ? r2 : r1;
  place(carrier, 0, -10);
  place(other, 0, -20);
  sim.kill(carrier, b, 0, false);
  assert.equal(sim.comp.bomb.state, BOMB.DROPPED);
  assert.equal(b.money, C.money.start + C.money.kill.default);
  run(sim, 2);
  assert.ok(!carrier.alive, 'raunt içinde doğmaz');
  place(other, 0.5, -10);
  run(sim, 0.1);
  assert.equal(sim.comp.bomb.state, BOMB.CARRIED);
  assert.equal(sim.comp.bomb.carrier, other);
  sim.kill(other, b, 0, false);
  run(sim, TICK_DT);
  assert.equal(sim.comp.winner, SIDE.BLUE);
  assert.equal(sim.comp.reason, ROUND_REASON.ELIM);
  // İkinci kayıp: lose[1]
  const before = r1.money;
  run(sim, C.rounds.postSec + 0.1);
  toLive(sim);
  for (const p of [r1, r2]) sim.kill(p, b, 0, false);
  run(sim, TICK_DT);
  assert.equal(r1.money, before + C.money.lose[1]);
  assert.equal(sim.comp.lossStreak[SIDE.RED], 2);
});

test('yarı değişimi ve maç sonu: roller değişir, para başa döner; toWin raunt maçı bitirir', () => {
  const sim = makeSim({ compOverrides: { rounds: { toWin: 3, max: 4, half: 2, buySec: 0.2, roundSec: 0.3, postSec: 0.1 } } });
  const r = human(sim, 'r', SIDE.RED);
  const b = human(sim, 'b', SIDE.BLUE);
  toBuy(sim);
  // Her raunt süre dolar → savunan kazanır
  run(sim, 1.4);
  assert.equal(sim.comp.round >= 3, true);
  assert.equal(sim.comp.attackSide, SIDE.BLUE, 'ikinci yarıda mavi saldırır');
  assert.ok(r.state.pos.z > 0 || !r.alive, 'kırmızı artık savunan doğuşunda');
  run(sim, 3);
  assert.equal(sim.phase, PHASE.ENDED);
  // 2 raunt kırmızı savunurken mavi kazandı (süre), sonra kırmızı savunarak kazanır: 2–2 → son raunt (max 4) berabere
  assert.equal(sim.scores[0] + sim.scores[1], 4);
  assert.ok(b.money <= C.money.max);
});

test('botlar: dolu 5v5 maç birkaç raunt oynar, bomba kurulur ya da raunt yok etmeyle biter', () => {
  const sim = new MatchSim({ world, arena, rules: { ...modeRules('competitive'), warmup: 0.2, compOverrides: { rounds: { buySec: 1, roundSec: 60, postSec: 0.5 } } }, mode: 'competitive', seed: 11 });
  sim.balanceBots();
  assert.equal(sim.players.filter(Boolean).length, 10);
  const ev = [];
  for (let i = 0; i < Math.round(300 / TICK_DT) && sim.comp.round < 4; i++) {
    sim.step();
    for (const e of sim.events) if (e.k === NEV.ROUND_STATE || e.k === NEV.BOMB) ev.push(e);
  }
  const ends = ev.filter((e) => e.k === NEV.ROUND_STATE && e.state === ROUND_STATE.POST);
  assert.ok(ends.length >= 2, `raunt bitti (${ends.length})`);
  assert.ok(ends.every((e) => e.reason !== ROUND_REASON.NONE));
  const bought = sim.players.filter((p) => p && p.compPrimary).length;
  assert.ok(bought > 0, 'botlar silah aldı');
  const planted = ev.some((e) => e.k === NEV.BOMB && e.state === BOMB.PLANTED);
  const elim = ends.some((e) => e.reason === ROUND_REASON.ELIM);
  assert.ok(planted || elim, 'bomba kuruldu ya da yok etme');
});
