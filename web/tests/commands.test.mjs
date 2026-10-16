// Tim komut katmanı (Operasyon Güncellemesi §8.2, §8.6): muhatap seçimi, medik kuralı, onay ve sonuç olayları
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Emitter } from '../src/util.js';
import { CommandSystem } from '../src/commands.js';
import SQUAD from '../src/data/squad.json' with { type: 'json' };
import { parseCommand } from '../src/commandParser.js';
import { RadioChat } from '../src/radioChat.js';

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
    player: { pos: new THREE.Vector3(), yaw: 0 },
    nav: { isWalkable: () => true },
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

test('sıralı telsiz emri tüm askerler varınca devam eder; yön, mesafe ve başlangıç bakışı korunur', () => {
  const { g } = fakeGame();
  const plan = g.commands.issuePlan(parseCommand('Demir ve Kaya sola 20 metre git sonra bekle'));
  const [a, b, other] = g.allies.list;
  assert.equal(plan.waiting, true);
  assert.ok(a.cmd.pos.distanceTo(new THREE.Vector3(-20, 0, 0)) < 1e-6);
  assert.deepEqual(other.orders, []);
  g.commands.complete(a, a.cmd);
  g.commands.update();
  assert.deepEqual(a.orders, ['MOVE_TO']);
  g.commands.complete(b, b.cmd);
  g.commands.update();
  assert.deepEqual(a.orders, ['MOVE_TO', 'HOLD']);
  assert.deepEqual(b.orders, ['MOVE_TO', 'HOLD']);
});

test('senkron emir tamamlanınca sonraki emir setOrder içinden başlamaz', () => {
  const { g } = fakeGame();
  const a = g.allies.list[0];
  a.setOrder = function (id, cmd) {
    if (id === 'HOLD_FIRE') g.commands.complete(this, cmd);
    this.order = { id };
  };
  g.commands.issuePlan(parseCommand('Demir ateş etme sonra sola 10 metre git'));
  assert.equal(a.order.id, 'HOLD_FIRE');
  g.commands.update();
  assert.equal(a.order.id, 'MOVE_TO');
});

test('yardım ve durum sorgusu devam eden hareket planını iptal etmez', () => {
  const { g, log } = fakeGame();
  const a = g.allies.list[0];
  a.health = { hp: 75, max: 100 };
  const plan = g.commands.issuePlan(parseCommand('Demir sola git sonra bekle'));
  const moving = a.cmd;
  g.commands.issuePlan(parseCommand('Demir durum raporu ver'));
  g.commands.issuePlan(parseCommand('yardım'));
  assert.ok(g.commands.plans.has(plan.id));
  assert.match(log.radio.find((line) => line.includes('Sağlık')), /%75/);
  assert.equal(a.cmd, moving);
  g.commands.complete(a, moving);
  g.commands.update();
  assert.deepEqual(a.orders, ['MOVE_TO', 'HOLD']);
});

test('ulaşılamayan hedef ve zaman aşımı planın kalan adımlarını çalıştırmaz', () => {
  for (const reason of ['no-path', 'timeout']) {
    const { g, log } = fakeGame();
    g.commands.issuePlan(parseCommand('Demir sola git sonra ateş serbest'));
    const a = g.allies.list[0];
    if (reason === 'timeout') { g.time = 1000; g.commands.update(); }
    else g.commands.fail(a, a.cmd, reason, 'Yol kapalı.');
    g.commands.update();
    assert.deepEqual(a.orders, ['MOVE_TO']);
    assert.equal(g.commands.plans.size, 0);
    assert.ok(log.radio.some((line) => line.includes('kalan adımlar durduruldu')));
  }
});

test('yeni emir ve iptal yalnız aynı muhatabın planını durdurur', () => {
  const { g } = fakeGame();
  const first = g.commands.issuePlan(parseCommand('Demir sola git sonra ateş serbest'));
  const second = g.commands.issuePlan(parseCommand('Yıldız sağa git sonra bekle'));
  g.commands.issue('HOLD', 'Alfa-1');
  assert.ok(!g.commands.plans.has(first.id));
  assert.ok(g.commands.plans.has(second.id));
  g.commands.issuePlan(parseCommand('Yıldız emirleri iptal et'));
  assert.ok(!g.commands.plans.has(second.id));
  assert.equal(g.allies.list[2].orders.at(-1), 'HOLD');
});

test('plan hedefi mesaj anındaki oyuncu yönüne bağlıdır', () => {
  const { g } = fakeGame();
  const a = g.allies.list[0];
  g.commands.issuePlan(parseCommand('Demir sola git sonra sağa 25 metre git'));
  const first = a.cmd;
  g.player.pos.set(100, 0, 100);
  g.player.yaw = Math.PI;
  g.commands.complete(a, first);
  g.commands.update();
  assert.ok(a.cmd.pos.distanceTo(new THREE.Vector3(25, 0, 0)) < 1e-6);
});

test('görev ve araç referansı yürünebilir yaklaşma noktasına bağlanır; eksik hedefte açık gerekçe verilir', () => {
  const { g, log } = fakeGame();
  g.mission.data = { laptop: { pos: new THREE.Vector3(4, 0, 5) } };
  g.nav.isWalkable = (x, z) => Math.hypot(x - 4, z - 5) >= 1;
  g.commands.issuePlan(parseCommand('Demir istihbarata git'));
  assert.ok(g.nav.isWalkable(g.allies.list[0].cmd.pos.x, g.allies.list[0].cmd.pos.z));
  const orders = g.allies.list[0].orders.length;
  g.commands.issuePlan(parseCommand('Demir helikopterin yanına git'));
  assert.equal(g.allies.list[0].orders.length, orders);
  assert.ok(log.radio.some((line) => line.includes('hedef noktası bulunamadı')));
});

test('yönle saldırı, duvar arkasındaki ve ters yöndeki düşmanı hedef seçmez', () => {
  const { g } = fakeGame();
  const enemy = (x, z) => ({ alive: true, pos: new THREE.Vector3(x, 0, z) });
  const visible = enemy(20, 0), behind = enemy(-3, 0), blocked = enemy(8, 0);
  g.enemies = { list: [behind, blocked, visible] };
  g.world = { raycast: (o, d, length) => length < 10 ? { dist: 1 } : null };
  g.commands.issuePlan(parseCommand('Demir sağdaki düşmana saldır'));
  assert.equal(g.allies.list[0].cmd.target, visible);
});

test('telsiz yazılı ve sesli giriş aynı emir planını kullanır; bilinmeyen emri uygulamaz', () => {
  const { g } = fakeGame();
  let received = null, closed = 0, suggestions = null;
  g.commands.issuePlan = (r, opts) => { received = { r, opts }; };
  const chat = { game: g, input: { value: '' }, closeChat: () => closed++, showSuggestions: (list) => { suggestions = list; } };
  RadioChat.prototype.submit.call(chat, 'Kaya beni iyileştir', 'voice');
  assert.equal(received.r.commandId, 'HEAL_PLAYER');
  assert.equal(received.opts.inputMethod, 'voice');
  received = null;
  const invalid = RadioChat.prototype.submit.call(chat, 'Demir sola git sonra pizza yap');
  assert.equal(invalid.commandId, 'UNKNOWN');
  assert.equal(received, null);
  assert.equal(closed, 1);
  assert.ok(suggestions.length);
});

test('aynı yere git ve devam et nişangâh değişse de önceki gerçek hedefi kullanır', () => {
  const { g } = fakeGame();
  const a = g.allies.list[0], other = g.allies.list[2];
  const send = (text) => g.commands.issuePlan(parseCommand(text, g.commands.radioContext));
  send('Demir sola 20 metre git');
  const destination = a.cmd.pos.clone();
  send('şimdi bekle');
  assert.equal(a.orders.at(-1), 'HOLD');
  assert.deepEqual(other.orders, []);
  g.player.yaw = Math.PI;
  g.commands.aim = () => { throw new Error('Eski hedef yerine nişangâha bakılmamalı'); };
  send('devam et');
  assert.equal(a.orders.at(-1), 'MOVE_TO');
  assert.ok(a.cmd.pos.equals(destination));
  send('Yıldız aynısını yap');
  assert.ok(other.cmd.pos.equals(destination));
  assert.equal(other.orders.at(-1), 'MOVE_TO');
  g.commands.clear();
  assert.equal(parseCommand('aynısını yap', g.commands.radioContext).reason, 'missing-context');
});

test('eski saldırı hedefi düşmüşse tekrar komutu başka düşmana sessizce ateş açmaz', () => {
  const { g, log } = fakeGame();
  const target = { alive: true, pos: new THREE.Vector3(5, 0, -10) };
  g.commands.aim = () => ({ point: target.pos.clone(), enemy: target });
  g.commands.issuePlan(parseCommand('Demir şunu vur'));
  target.alive = false;
  g.commands.issuePlan(parseCommand('aynısını yap', g.commands.radioContext));
  assert.deepEqual(g.allies.list[0].orders, ['ATTACK']);
  assert.ok(log.radio.some((line) => line.includes('artık uygun değil')));
});

test('aynısını yap aynı mesajda önceki adımın yeni hedefini kullanabilir', () => {
  const { g } = fakeGame();
  const [a, , b] = g.allies.list;
  const parsed = parseCommand('Demir sola 10 metre git sonra Yıldız aynısını yap');
  assert.equal(parsed.steps.length, 2);
  g.commands.issuePlan(parsed);
  assert.deepEqual(b.orders, []);
  const target = a.cmd.pos.clone();
  g.commands.complete(a, a.cmd);
  g.commands.update();
  assert.equal(b.cmd.commandId, 'MOVE_TO');
  assert.ok(b.cmd.pos.equals(target));
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
