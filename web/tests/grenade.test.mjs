// Çevrim içi el bombası ve sis (shared/sim/grenade.js, server/game/sim.js): atış sınırı, patlama hasarı ve öldürme
// yazımı, kendi bombası, takım arkadaşı, sis görüşü keser, istemci aynı yörüngeyi hesaplar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CollisionWorld } from '../shared/sim/collision.js';
import { createInputCmd, BTN } from '../shared/sim/movement.js';
import { createThrow, stepGrenade, blastFactor, smokeBlocksLine, NADE_KIND } from '../shared/sim/grenade.js';
import { NEV, WEAPON_FRAG } from '../shared/net/protocol.js';
import { Writer, encodeSnapshot, decodeServer } from '../shared/net/codec.js';
import { MatchSim } from '../server/game/sim.js';
import { modeRules } from '../server/game/rooms.js';
import { ONLINE } from '../src/config.js';
import { TICK_DT } from '../shared/constants.js';
import ARENAS from '../src/data/arenas.json' with { type: 'json' };

const world = CollisionWorld.fromJSON(JSON.parse(readFileSync(new URL('../shared/maps/depo.collision.json', import.meta.url), 'utf8')));
const N = ONLINE.nades;

function makeSim(mode = 'dm') {
  const sim = new MatchSim({ world, arena: ARENAS.depo, rules: { ...modeRules(mode), warmup: 0, bots: 'none' }, mode, seed: 5 });
  return sim;
}

function human(sim, id, side = 255) {
  const slot = sim.addPlayer({ id, name: id, side, primary: 'rifle', secondary: 'pistol' });
  sim.setReady(slot);
  return sim.players[slot];
}

// Oyuncuyu açık bir yere koy (depo ortası boş: yol), bakış -Z
function place(p, x, z, yaw = 0) {
  p.state.pos.x = x;
  p.state.pos.y = 0;
  p.state.pos.z = z;
  p.state.vel.x = p.state.vel.y = p.state.vel.z = 0;
  p.state.yaw = yaw;
}

let seq = 0;
function cmd(p, buttons, pitch = -0.6, yaw = 0) {
  const c = createInputCmd();
  c.seq = ++seq & 0xffff;
  c.buttons = buttons;
  c.yaw = yaw;
  c.pitch = pitch;
  c.slot = 0;
  c.shots = [];
  p.queue.push(c);
}

// Gerçek istemci her tick bir komut yollar (bekleme süreleri oyuncunun komut saatiyle işler): kuyruğu boş kalan
// canlı oyuncuya boş komut ver
function run(sim, sec, onEvent) {
  for (let i = 0; i < Math.round(sec / TICK_DT); i++) {
    for (const p of sim.players) if (p && !p.bot && p.alive && !p.queue.length) cmd(p, 0, -0.2, p.state.yaw);
    sim.step();
    for (const e of sim.events) onEvent?.(e);
  }
}

test('atış sınırı: doğuşta 1 bomba + 1 sis; ikinci bomba atılmaz', () => {
  const sim = makeSim();
  const a = human(sim, 'a');
  sim.step();
  place(a, 0, 0);
  const nades = [];
  cmd(a, BTN.THROW_FRAG);
  run(sim, 1, (e) => e.k === NEV.NADE && nades.push(e));
  cmd(a, BTN.THROW_FRAG);
  run(sim, 1, (e) => e.k === NEV.NADE && nades.push(e));
  cmd(a, BTN.THROW_SMOKE);
  run(sim, 1, (e) => e.k === NEV.NADE && nades.push(e));
  assert.equal(nades.length, 2);
  assert.deepEqual(nades.map((e) => e.kind), [NADE_KIND.FRAG, NADE_KIND.SMOKE]);
  assert.equal(a.nadeCount[0], 0);
});

// Yalnız atanın olduğu bir denemede bombanın patladığı yer (yörünge yalnız dünyaya çarpar: hedef oyuncu değiştirmez)
function landing(pitch) {
  const sim = makeSim();
  const a = human(sim, 'a');
  sim.step();
  run(sim, 2.5);
  place(a, 0, 6);
  cmd(a, BTN.THROW_FRAG, pitch);
  let pos = null;
  run(sim, N.fuse + 0.5, (e) => e.k === NEV.BLAST && (pos = e.pos));
  return pos;
}

test('patlama: yakındaki rakip ölür, öldürme atana yazılır (el bombası), atan kendi bombasından az etkilenir', () => {
  const at = landing(-0.95);
  assert.ok(at, 'deneme bombası patladı');
  const sim = makeSim();
  const a = human(sim, 'a');
  const b = human(sim, 'b');
  sim.step();
  run(sim, 2.5); // doğuş koruması biter
  place(a, 0, 6);
  place(b, at.x + 1, at.z); // bombanın düştüğü yerin 1 m yanı
  cmd(a, BTN.THROW_FRAG, -0.95);
  const ev = [];
  run(sim, N.fuse + 0.5, (e) => ev.push(e));
  const blast = ev.find((e) => e.k === NEV.BLAST);
  const kill = ev.find((e) => e.k === NEV.KILL);
  assert.ok(blast, 'patladı');
  const d = Math.hypot(blast.pos.x - b.state.pos.x, blast.pos.z - b.state.pos.z);
  assert.ok(d < 4, `b'nin yakınına düştü (${d.toFixed(1)} m)`);
  assert.ok(kill && kill.victim === b.slot && kill.killer === a.slot && kill.weapon === WEAPON_FRAG, 'öldürme el bombasıyla atana');
  assert.equal(a.kills, 1);
  // Kendi bombası: atan ayağına atarsa azaltılmış hasar alır
  const sim2 = makeSim();
  const c = human(sim2, 'c');
  sim2.step();
  run(sim2, 2.5);
  place(c, 0, 0);
  cmd(c, BTN.THROW_FRAG, -1.4);
  run(sim2, N.fuse + 0.3);
  assert.ok(c.hp < 100, `kendi bombası yaraladı (can ${c.hp.toFixed(0)})`);
  assert.ok(100 - c.hp <= N.damage * N.selfMult + 1e-6, 'kendi bombası azaltılmış');
});

test('takım ölüm maçında takım arkadaşı yaralanmaz; siper arkası çok az hasar', () => {
  const sim = new MatchSim({ world, arena: ARENAS.depo, rules: { ...modeRules('tdm'), warmup: 0, bots: 'none' }, mode: 'tdm', seed: 5 });
  const a = human(sim, 'a', 0);
  const m = human(sim, 'm', 0);
  sim.step();
  run(sim, 2.5);
  place(a, 0, 8);
  place(m, 0, -1);
  cmd(a, BTN.THROW_FRAG, -0.95);
  run(sim, N.fuse + 0.3);
  assert.equal(m.hp, ONLINE.hp, 'takım arkadaşı tam can');
  assert.ok(blastFactor(2, false) < blastFactor(2, true) * 0.3);
  assert.equal(blastFactor(N.radius + 0.1, true), 0);
});

test('sis: açılınca bulutun içinden görüş kesilir, süre bitince geri gelir; botun algısı da', () => {
  const sim = makeSim();
  const a = human(sim, 'a');
  sim.step();
  place(a, 0, 4);
  cmd(a, BTN.THROW_SMOKE, -0.9);
  run(sim, N.smoke.fuse + N.smoke.grow + 0.3);
  assert.equal(sim.smokes.length, 1);
  const s = sim.smokes[0];
  const from = { x: s.x - 8, y: 1.6, z: s.z };
  const to = { x: s.x + 8, y: 1.6, z: s.z };
  assert.equal(sim.canSee(from, to), false, 'bulut görüşü kesiyor');
  assert.equal(smokeBlocksLine(sim.smokes, from, { x: s.x - 8, y: 1.6, z: s.z - 12 }), false, 'buluttan uzak hat açık');
  run(sim, N.smoke.duration);
  assert.equal(sim.smokes.length, 0);
  assert.equal(sim.canSee(from, to), world.lineOfSight(from, to), 'sis dağıldı');
});

test('istemci aynı yörüngeyi hesaplar: ağdan gelen başlangıçla sunucunun patladığı yere düşer', () => {
  const sim = makeSim();
  const a = human(sim, 'a');
  sim.step();
  place(a, 3, 10, 0.4);
  a.state.vel.x = 2.5; // koşarken atış: hızın payı bombaya geçer
  cmd(a, BTN.THROW_FRAG, 0.2, 0.4);
  let nade = null;
  let blast = null;
  const w = new Writer();
  run(sim, N.fuse + 0.3, (e) => {
    // Olay ağdan geçmiş gibi kodlanıp çözülür
    const snap = { tick: 1, ackSeq: 0, bufDepth: 0, tickUs: 0, phase: 1, phaseLeft: 0, scoreA: 0, scoreB: 0, me: { alive: false, hp: 0, respawnIn: 0, state: null }, players: [], events: [e] };
    const d = decodeServer(encodeSnapshot(w, snap)).events[0];
    if (d.k === NEV.NADE) nade = d;
    if (d.k === NEV.BLAST) blast = d;
  });
  assert.ok(nade && blast);
  const g = { kind: nade.kind, pos: { ...nade.pos }, vel: { ...nade.vel }, fuse: N.fuse, rest: false };
  // Sunucu atış tick'inden sonraki her tick'te bir adım attı
  let steps = 0;
  while (g.fuse > 0 && steps < 1000) {
    stepGrenade(g, world, TICK_DT);
    steps++;
  }
  const err = Math.hypot(g.pos.x - blast.pos.x, g.pos.y - blast.pos.y, g.pos.z - blast.pos.z);
  assert.ok(err < 0.05, `istemci ile sunucu farkı ${(err * 100).toFixed(1)} cm`);
  // createThrow: bakış yönünde, hızın payıyla
  const t = createThrow({ x: 0, y: 1.6, z: 0 }, 0, 0, { x: 2, y: 0, z: 0 }, NADE_KIND.FRAG);
  assert.ok(t.vel.z < -N.throwSpeed * 0.9 && Math.abs(t.vel.x - 2 * N.inherit) < 1e-9);
});
