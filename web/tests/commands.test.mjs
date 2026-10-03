// Tim komut katmanı (Operasyon Güncellemesi §8.2, §8.6): muhatap seçimi, medik kuralı, onay ve sonuç olayları
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Emitter } from '../src/util.js';
import { CommandSystem } from '../src/commands.js';
import SQUAD from '../src/data/squad.json' with { type: 'json' };

// Oyunun komut sisteminin dokunduğu kısmı: askerler, telsiz, kayıt, olaylar
function fakeGame() {
  const events = new Emitter();
  const log = { radio: [], ev: [] };
  for (const n of ['COMMAND_ISSUED', 'COMMAND_COMPLETED', 'COMMAND_FAILED']) events.on(n, (e) => log.ev.push([n, e.commandId, e.reason || '', (e.addressees || []).join('+')]));
  const g = {
    events,
    mode: 'mission',
    time: 0,
    save: { data: { stats: { commandsIssued: 0 } }, update: (fn) => fn(g.save.data) },
    mission: { radio: (who, text) => log.radio.push(`${who}: ${text}`) },
    allies: { list: [] },
  };
  g.commands = new CommandSystem(g);
  g.allies.list = SQUAD.members.map((m) => ({
    member: m,
    callsign: m.callsign,
    role: m.role,
    down: false,
    radioLabel: `${m.callsign} ${m.name}`,
    orders: [],
    sayLine(t) {
      log.radio.push(`${this.radioLabel}: ${t}`);
    },
    setOrder(id, cmd) {
      this.orders.push(id);
      this.cmd = cmd;
    },
  }));
  return { g, log };
}

test('tüm tim: üç asker emir alır, onayı Alfa-1 verir, istatistik artar', () => {
  const { g, log } = fakeGame();
  const c = g.commands.issue('TAKE_COVER', 'all', { inputMethod: 'shortcut' });
  assert.deepEqual(c.addressees, ['Alfa-1', 'Alfa-2', 'Alfa-3']);
  assert.ok(g.allies.list.every((a) => a.orders[0] === 'TAKE_COVER'));
  assert.equal(log.radio[0], 'Komutan → Alfa Timi: Siper alın!');
  assert.match(log.radio[1], /^Alfa-1 Demir: /);
  assert.equal(g.save.data.stats.commandsIssued, 1);
  assert.deepEqual(log.ev[0], ['COMMAND_ISSUED', 'TAKE_COVER', '', 'Alfa-1+Alfa-2+Alfa-3']);
});

test('tek ve çoklu muhatap; yerdeki asker emir almaz', () => {
  const { g } = fakeGame();
  assert.deepEqual(g.commands.issue('HOLD', 'Alfa-3').addressees, ['Alfa-3']);
  assert.deepEqual(g.commands.issue('FOLLOW', ['Alfa-1', 'Alfa-3']).addressees, ['Alfa-1', 'Alfa-3']);
  g.allies.list[0].down = true;
  assert.deepEqual(g.commands.issue('FOLLOW', 'all').addressees, ['Alfa-2', 'Alfa-3']);
});

test('"Beni iyileştir"i yalnız medik uygular; medik yoksa başarısız', () => {
  const { g, log } = fakeGame();
  assert.deepEqual(g.commands.issue('HEAL_PLAYER', 'all').addressees, ['Alfa-2']);
  assert.equal(g.commands.issue('HEAL_PLAYER', 'Alfa-1'), null);
  assert.equal(log.ev.at(-1)[0], 'COMMAND_FAILED');
});

test('komut, bütün muhataplar bitirince tamamlanır; rapor son bitirenden', () => {
  const { g, log } = fakeGame();
  const c = g.commands.issue('MOVE_TO', ['Alfa-1', 'Alfa-2'], { pos: new THREE.Vector3(5, 0, 5) });
  const [a1, a2] = g.allies.list;
  g.commands.complete(a1, c, 'Pozisyondayım.');
  assert.ok(!log.ev.some((e) => e[0] === 'COMMAND_COMPLETED'), 'biri bitirdi: henüz tamamlanmadı');
  g.commands.complete(a2, c, 'Yerimdeyim.');
  assert.deepEqual(log.ev.at(-1).slice(0, 2), ['COMMAND_COMPLETED', 'MOVE_TO']);
  assert.equal(log.radio.at(-1), 'Alfa-2 Kaya: Yerimdeyim.');
  g.commands.complete(a2, c);
  assert.equal(log.ev.filter((e) => e[0] === 'COMMAND_COMPLETED').length, 1, 'iki kez tamamlanmaz');
});

test('başarısızlık gerekçesiyle; yere düşen son asker komutu düşürür; zaman aşımı', () => {
  const { g, log } = fakeGame();
  const c = g.commands.issue('CLEAR_AREA', 'Alfa-3', { pos: new THREE.Vector3() });
  g.commands.fail(g.allies.list[2], c, 'no-path', 'Oraya yol yok komutanım!');
  assert.deepEqual(log.ev.at(-1).slice(0, 3), ['COMMAND_FAILED', 'CLEAR_AREA', 'no-path']);
  const c2 = g.commands.issue('HOLD', 'Alfa-1');
  g.commands.drop(g.allies.list[0], c2, 'down');
  assert.deepEqual(log.ev.at(-1).slice(0, 3), ['COMMAND_FAILED', 'HOLD', 'down']);
  g.commands.issue('FOLLOW', 'Alfa-2');
  g.time = 1000;
  g.commands.update();
  assert.deepEqual(log.ev.at(-1).slice(0, 3), ['COMMAND_FAILED', 'FOLLOW', 'timeout']);
});

test('saldır hedefsiz verilemez; görev dışında komut yok', () => {
  const { g, log } = fakeGame();
  g.commands.aim = () => ({ point: new THREE.Vector3(), enemy: null });
  assert.equal(g.commands.issue('ATTACK', 'all'), null);
  assert.deepEqual(log.ev.at(-1).slice(0, 3), ['COMMAND_FAILED', 'ATTACK', 'no-target']);
  g.mode = 'range';
  assert.equal(g.commands.issue('FOLLOW', 'all'), null);
});
