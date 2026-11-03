// Görev ve meydan okumalar (Operasyon Güncellemesi §6.2–6.4): koşul türleri, ödül oranları, yıldızlar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Emitter } from '../src/util.js';
import { levelMission, MissionTracker, computeRewards, mergeRecord, matchFilter, bonusAmount, RULES } from '../src/missionSystem.js';

const kill = (o = {}) => ({ killer: 'player', headshot: false, distance: 20, slot: 'primary', ...o });

test('seviye tanımı veriden: havuz + seviye satırının ezdiği değerler', () => {
  const m = levelMission(1);
  assert.equal(m.primary.reward, 1000);
  assert.equal(m.bonus.length, 3);
  const hh = m.bonus.find((b) => b.id === 'headhunter');
  assert.deepEqual([hh.count, hh.reward], [3, 200], 'seviye 1: 3 kafa vuruşu, 200 KR');
  assert.match(hh.desc, /3 kafa vuruşuyla/);
  assert.match(levelMission(2).bonus.find((b) => b.id === 'blitz').desc, /7:00 altında/);
  assert.equal(levelMission(99), null);
});

test('tekrar oynamada farklı bonus seçimi (ayar): havuzdan üç farklı görev', () => {
  let i = 0;
  const seq = [0.9, 0.1, 0.5, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6, 0.05];
  const m = levelMission(1, { reroll: true, rnd: () => seq[i++ % seq.length] });
  assert.equal(new Set(m.bonus.map((b) => b.id)).size, 3);
});

test('filtre: eşitlik, gte/lte, in', () => {
  assert.ok(matchFilter({ headshot: true, killer: 'player' }, kill({ headshot: true })));
  assert.ok(!matchFilter({ headshot: true }, kill()));
  assert.ok(matchFilter({ distance: { gte: 60 } }, kill({ distance: 75 })));
  assert.ok(!matchFilter({ distance: { gte: 60 } }, kill({ distance: 40 })));
  assert.ok(matchFilter({ slot: { in: ['secondary'] } }, kill({ slot: 'secondary' })));
});

test('count: kafa vuruşu sayılır, yalnız oyuncununkiler; never: olay bozar; timer: hedef süre', () => {
  const ev = new Emitter();
  const changes = [];
  const t = new MissionTracker(ev, levelMission(1), (i, kind) => changes.push(kind));
  ev.emit('ENEMY_KILLED', kill({ headshot: true }));
  ev.emit('ENEMY_KILLED', kill({ headshot: true, killer: 'ally' }));
  ev.emit('ENEMY_KILLED', kill());
  ev.emit('ENEMY_KILLED', kill({ headshot: true }));
  assert.equal(t.state[0].progress, 2);
  ev.emit('ENEMY_KILLED', kill({ headshot: true }));
  assert.equal(t.state[0].done, true);
  ev.emit('ITEM_USED', { id: 'medkit' });
  assert.equal(t.state[2].failed, true, 'Tutumlu bozuldu');
  assert.deepEqual(changes, ['progress', 'progress', 'done', 'failed']);
  const res = t.finish(true, 300);
  assert.deepEqual(res.map((r) => r.done), [true, true, false], 'Keskin Göz ✔, Dokunulmaz ✔ (olay yok), Tutumlu ✖');
  ev.emit('ENEMY_KILLED', kill({ headshot: true }));
  assert.equal(t.state[0].progress, 3, 'bitince dinleme durur');

  const ev2 = new Emitter();
  const t2 = new MissionTracker(ev2, levelMission(2));
  ev2.emit('PLAYER_DIED', {});
  const r2 = t2.finish(true, 421);
  assert.equal(r2.find((r) => r.id === 'blitz').done, false, '7:01 > 7:00');
  const t3 = new MissionTracker(new Emitter(), levelMission(2));
  assert.equal(t3.finish(true, 419).find((r) => r.id === 'blitz').done, true);
  const t4 = new MissionTracker(ev2, levelMission(1));
  ev2.emit('PLAYER_DIED', {});
  assert.equal(t4.finish(true, 100).find((r) => r.id === 'untouchable').done, false, 'ölmek Dokunulmaz\'ı bozar');
});

test('ödül: ilk tamamlama tam, tekrarda ana %50 / bonus %25; zorluk çarpanı her kaleme', () => {
  const m = levelMission(1);
  const results = [{ id: 'headhunter', done: true }, { id: 'untouchable', done: true }, { id: 'frugal', done: false }];
  const first = computeRewards({ mission: m, success: true, results, difficulty: 'normal' });
  assert.equal(first.total, 1000 + 200 + 500);
  assert.equal(first.stars, 2, '2 bonus → 2 yıldız');
  assert.equal(first.firstClear, true);
  const hard = computeRewards({ mission: m, success: true, results, difficulty: 'hard' });
  assert.equal(hard.total, Math.round(1000 * 1.4) + Math.round(200 * 1.4) + Math.round(500 * 1.4));
  const rec = mergeRecord(null, { success: true, stars: first.stars, results, timeSec: 300 });
  assert.deepEqual([rec.completed, rec.stars, rec.bonusDone, rec.bestTimeSec], [true, 2, ['headhunter', 'untouchable'], 300]);
  const all = results.map((r) => ({ ...r, done: true }));
  const again = computeRewards({ mission: m, success: true, results: all, difficulty: 'easy', record: rec });
  // ana 1000×0,5×0,8 · Keskin Göz 200×0,25×0,8 · Dokunulmaz 500×0,25×0,8 · Tutumlu (ilk kez) 200×1×0,8
  assert.equal(again.total, 400 + 40 + 100 + 160);
  assert.equal(again.stars, 3);
  assert.equal(bonusAmount(m.bonus[2], rec, 'easy'), 160);
  const rec2 = mergeRecord(rec, { success: true, stars: 3, results: all, timeSec: 340 });
  assert.deepEqual([rec2.stars, rec2.bestTimeSec, rec2.plays], [3, 300, 2], 'en iyi korunur');
});

test('başarısızlık: bonus yok, öldürme başına teselli', () => {
  const r = computeRewards({ mission: levelMission(3), success: false, results: [], kills: 7, difficulty: 'hard' });
  assert.equal(r.total, 7 * RULES.consolationPerKill);
  assert.equal(r.stars, 0);
});
