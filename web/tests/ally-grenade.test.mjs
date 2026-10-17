import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { CommandSystem } from '../src/commands.js';
import { parseCommand } from '../src/commandParser.js';
import { Emitter } from '../src/util.js';
import { ALLY, SOLDIER_ANIM } from '../src/config.js';
import SQUAD from '../src/data/squad.json' with { type: 'json' };

// Gerçek asker mantığı; yalnız görsel model fabrikası DOM gerektirmeyen bir sahteyle değiştirilir.
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../src/ally.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'headless-soldier', setup(b) {
    b.onResolve({ filter: /soldier\.js$/ }, () => ({ path: 'soldier', namespace: 'headless' }));
    b.onLoad({ filter: /.*/, namespace: 'headless' }, () => ({ contents: 'export function createSoldier() { throw new Error("Görsel model testte kullanılmaz"); }' }));
    b.onResolve({ filter: /^three$/ }, () => ({ path: import.meta.resolve('three'), external: true }));
  } }],
});
const { Ally } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

function fixture(count = 1) {
  const spawned = [], messages = [], completed = [], failed = [];
  const g = {
    mode: 'mission', time: 10, events: new Emitter(),
    player: { pos: new THREE.Vector3(), yaw: 0 },
    world: { raycast: () => null }, nav: { isWalkable: () => true },
    save: { data: { stats: {} }, update(fn) { fn(this.data); } },
    mission: { radio: (who, text) => messages.push(text) },
    grenades: { spawn: (...args) => spawned.push(args) },
    allies: { list: [], grenadeT: 0 },
  };
  g.commands = new CommandSystem(g);
  g.commands.aim = (maxDist) => ({ point: new THREE.Vector3(0, 0, -Math.min(maxDist, 24)), enemy: null });
  for (let i = 0; i < count; i++) {
    const a = Object.assign(Object.create(Ally.prototype), {
      game: g, member: SQUAD.members[i], callsign: SQUAD.members[i].callsign,
      pos: new THREE.Vector3(i * 2, 0, 0), grenadeUntil: 0, grenadeT: 5, throwAnim: null,
      order: { id: 'FOLLOW', cmd: null },
      headPos(out) { return out.copy(this.pos).add(new THREE.Vector3(0, 1.5, 0)); },
      sayLine: text => messages.push(text),
      has: () => false, // ilk kademede otonom bomba taktiği kapalıdır
    });
    g.allies.list.push(a);
  }
  g.events.on('COMMAND_COMPLETED', e => completed.push(e));
  g.events.on('COMMAND_FAILED', e => failed.push(e));
  return { g, a: g.allies.list[0], spawned, messages, completed, failed };
}

test('bomba at ilk kademede gerçek müttefik bombası üretir; sonraki adım elden çıkmasını bekler', () => {
  const { g, a, spawned, completed } = fixture();
  g.commands.issuePlan(parseCommand('Demir bomba at sonra bekle'));
  assert.equal(spawned.length, 0);
  assert.ok(a.throwAnim);
  assert.equal(a.order.id, 'FOLLOW');
  a.updateGrenade(SOLDIER_ANIM.throwRelease - 0.01, false);
  g.commands.update();
  assert.equal(a.order.id, 'FOLLOW');
  a.updateGrenade(0.02, false);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0][3], 'ally');
  const [from, velocity] = spawned[0];
  const flight = a.grenadeFlight(new THREE.Vector3(0, 0, -24), true);
  const landing = from.clone().addScaledVector(velocity, flight.time);
  landing.y -= 0.5 * 15 * flight.time ** 2;
  assert.ok(landing.distanceTo(new THREE.Vector3(0, 0, -24)) < 1e-8);
  assert.equal(completed[0].commandId, 'THROW_GRENADE');
  g.commands.update();
  assert.equal(a.order.id, 'HOLD');
  a.updateGrenade(1, false);
  assert.equal(spawned.length, 1, 'animasyon ikinci bomba üretmez');
});

test('tüm tim emrinde seçilen her asker bir bomba atar; tamamlanma son atışı bekler', () => {
  const { g, spawned, completed } = fixture(3);
  g.commands.issuePlan(parseCommand('Herkes ileri 20 metre bomba at'));
  g.allies.list[0].updateGrenade(0.5, false);
  assert.equal(completed.length, 0);
  for (const a of g.allies.list.slice(1)) a.updateGrenade(0.5, false);
  assert.equal(spawned.length, 3);
  assert.equal(completed.length, 1);
});

test('menzil, dost, engel ve bekleme hatalarında bomba atılmaz ve plan ilerlemez', () => {
  for (const reason of ['range', 'friendly-near', 'blocked', 'cooldown']) {
    const { g, a, spawned, failed } = fixture(2);
    let text = 'Demir ileri 20 metre bomba at sonra ateş serbest';
    if (reason === 'range') text = 'Demir ileri 50 metre bomba at sonra ateş serbest';
    if (reason === 'friendly-near') g.allies.list[1].pos.set(0, 0, -18);
    if (reason === 'blocked') g.world.raycast = () => ({ dist: 0.1, point: new THREE.Vector3(0, 2, -1) });
    if (reason === 'cooldown') a.grenadeUntil = g.time + 5;
    g.commands.issuePlan(parseCommand(text));
    g.commands.update();
    assert.equal(a.throwAnim, null, reason);
    assert.equal(spawned.length, 0, reason);
    assert.equal(failed[0].reason, reason);
    assert.equal(g.commands.plans.size, 0, reason);
    assert.notEqual(a.holdFire, false, 'sonraki ateş serbest adımı başlamaz');
  }
});

test('elden çıkmadan hedefe yaklaşan dost atışı durdurur', () => {
  const { g, a, spawned, failed } = fixture(2);
  g.commands.issuePlan(parseCommand('Demir ileri 20 metre bomba at'));
  g.allies.list[1].pos.set(0, 0, -19);
  a.updateGrenade(0.5, false);
  assert.equal(spawned.length, 0);
  assert.equal(failed[0].reason, 'friendly-near');
});

test('iptal edilen hazırlık atış yapmaz; atıştan sonra bekleme süresi işler', () => {
  const { g, a, spawned } = fixture();
  g.commands.issuePlan(parseCommand('Demir bomba at'));
  g.commands.issuePlan(parseCommand('Demir emirleri iptal et'));
  a.updateGrenade(0.5, false);
  assert.equal(spawned.length, 0);
  g.commands.issuePlan(parseCommand('Demir bomba at'));
  a.updateGrenade(1, false);
  assert.equal(spawned.length, 1);
  assert.equal(a.grenadeUntil, g.time + ALLY.grenade.cooldown);
  g.commands.issuePlan(parseCommand('Demir bomba at'));
  assert.equal(a.throwAnim, null);
  assert.equal(spawned.length, 1);
  g.time += ALLY.grenade.cooldown;
  g.commands.issuePlan(parseCommand('Demir bomba at'));
  a.updateGrenade(1, false);
  assert.equal(spawned.length, 2);
});
