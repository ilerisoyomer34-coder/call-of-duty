// Oyuncu ilerlemesi (data/progression.json): seviye eğrisi, rütbe, günlük ödül serisi, günün görevleri, olay bağlantısı
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROG, xpForLevel, levelFromXp, rankFor, addXp, freshProgression, normalizeProgression, dailyStatus, claimDaily, dayDiff, challengesFor, ensureChallenges, challengeEvent, xpForEvent, ProgressionSystem } from '../src/progression.js';
import { SaveSystem } from '../src/save.js';
import { EconomySystem } from '../src/economy.js';
import { Emitter } from '../src/util.js';
import { EV } from '../src/events.js';
import { memoryStore } from './helpers.mjs';

test('seviye eğrisi: artan, yuvarlanmış; toplam XP seviyeye çevrilir', () => {
  assert.equal(xpForLevel(1), PROG.levels.base);
  for (let n = 1; n < 30; n++) assert.ok(xpForLevel(n + 1) >= xpForLevel(n));
  assert.equal(xpForLevel(10) % PROG.levels.round, 0);
  assert.deepEqual(levelFromXp(0), { level: 1, into: 0, need: xpForLevel(1), frac: 0, max: false });
  const L = levelFromXp(xpForLevel(1) + xpForLevel(2) + 10);
  assert.equal(L.level, 3);
  assert.equal(L.into, 10);
  assert.ok(levelFromXp(1e12).max && levelFromXp(1e12).level === PROG.levels.max);
});

test('rütbeler seviyeyle yükselir', () => {
  assert.equal(rankFor(1).name, 'Er');
  assert.equal(rankFor(6).name, 'Çavuş');
  assert.equal(rankFor(9).name, 'Çavuş');
  assert.equal(rankFor(100).name, 'Orgeneral');
  for (let i = 1; i < PROG.ranks.length; i++) assert.ok(PROG.ranks[i].from > PROG.ranks[i - 1].from, 'rütbe eşikleri sıralı');
});

test('XP ekleme seviye atlatır ve ödülleri sayar (her 5. seviyede ek kredi)', () => {
  const p = freshProgression();
  let total = 0;
  for (let n = 1; n < 5; n++) total += xpForLevel(n);
  const r = addXp(p, total);
  assert.deepEqual(r.levels, [2, 3, 4, 5]);
  const R = PROG.levelReward;
  assert.equal(r.credits, 4 * R.credits + R.milestoneCredits);
});

test('günlük ödül: art arda günler seriyi büyütür, kaçan gün başa döndürür, günde bir kez', () => {
  const p = freshProgression();
  assert.equal(dayDiff('2026-10-14', '2026-10-15'), 1);
  assert.equal(dayDiff('2026-12-31', '2027-01-01'), 1);
  const a = claimDaily(p, '2026-10-14');
  assert.deepEqual(a, { credits: PROG.daily.credits[0], xp: PROG.daily.xp[0], day: 1 });
  assert.equal(claimDaily(p, '2026-10-14'), null, 'aynı gün ikinci kez yok');
  assert.equal(claimDaily(p, '2026-10-15').day, 2);
  assert.equal(dailyStatus(p, '2026-10-16').day, 3);
  assert.equal(claimDaily(p, '2026-10-18').day, 1, 'bir gün kaçtı: seri başa döner');
  // Yedinci günden sonra döngü
  const q = freshProgression();
  for (let i = 0; i < 7; i++) claimDaily(q, `2026-11-${String(i + 1).padStart(2, '0')}`);
  assert.equal(q.daily.streak, 7);
  assert.equal(claimDaily(q, '2026-11-08').day, 1);
});

test('günün görevleri: o gün herkes için aynı, farklı günde değişir, tekrar yok', () => {
  const a = challengesFor('2026-10-14').map((c) => c.id);
  assert.deepEqual(challengesFor('2026-10-14').map((c) => c.id), a);
  assert.equal(new Set(a).size, PROG.challenges.perDay);
  const days = new Set();
  for (let d = 1; d <= 20; d++) days.add(challengesFor(`2026-10-${String(d).padStart(2, '0')}`).map((c) => c.id).join());
  assert.ok(days.size > 10, 'günler arasında görevler değişiyor');
  for (const c of PROG.challenges.pool) assert.ok(c.count > 0 && c.credits > 0 && c.xp > 0 && c.event, c.id);
});

test('görev ilerlemesi olay ve filtreyle; dolunca bir kez tamamlanır', () => {
  const p = freshProgression();
  ensureChallenges(p, '2026-10-14');
  p.challenges.list = [{ id: 'head8', progress: 0, done: false }];
  assert.equal(challengeEvent(p, EV.ENEMY_KILLED, { killer: 'player', headshot: false }).length, 0);
  assert.equal(p.challenges.list[0].progress, 0, 'filtre tutmadı');
  for (let i = 0; i < 7; i++) challengeEvent(p, EV.ENEMY_KILLED, { killer: 'player', headshot: true });
  const done = challengeEvent(p, EV.ENEMY_KILLED, { killer: 'player', headshot: true });
  assert.equal(done.length, 1);
  assert.equal(challengeEvent(p, EV.ENEMY_KILLED, { killer: 'player', headshot: true }).length, 0, 'ikinci kez verilmez');
});

test('kayıt: bozuk ilerleme onarılır', () => {
  assert.deepEqual(normalizeProgression(null), freshProgression());
  const n = normalizeProgression({ xp: -5, daily: 'x', challenges: { day: 3 } });
  assert.equal(n.xp, 0);
  assert.deepEqual(n.daily, { last: null, streak: 0 });
  assert.deepEqual(n.challenges, { day: null, list: [] });
});

test('XP kaynakları: öldürme, kafa, bıçak, görev sonu; yalnız oyuncunun', () => {
  const X = PROG.xp;
  assert.equal(xpForEvent(EV.ENEMY_KILLED, { killer: 'player', headshot: true }), X.kill + X.headshot);
  assert.equal(xpForEvent(EV.ENEMY_KILLED, { killer: 'player', weaponId: 'melee' }), X.melee);
  assert.equal(xpForEvent(EV.ENEMY_KILLED, { killer: 'Alfa-1' }), 0);
  assert.equal(xpForEvent(EV.MISSION_ENDED, { success: true, stars: 3 }), X.missionComplete + 3 * X.perStar);
  assert.equal(xpForEvent(EV.MISSION_ENDED, { success: false }), X.missionFail);
});

test('ProgressionSystem: olaylardan XP ve kredi, poligonda yok, günlük ödül kayda yazılır', () => {
  const save = new SaveSystem({ store: memoryStore(), startCredits: 0 });
  const events = new Emitter();
  const economy = new EconomySystem(save, events);
  let mode = 'mission';
  const sys = new ProgressionSystem({ save, economy, events, mode: () => mode, now: () => new Date(2026, 9, 14, 12) });
  const ups = [];
  events.on(EV.LEVEL_UP, (e) => ups.push(e.level));
  assert.equal(sys.challenges().length, PROG.challenges.perDay);
  events.emit(EV.ENEMY_KILLED, { killer: 'player', headshot: true });
  assert.equal(save.data.progression.xp, PROG.xp.kill + PROG.xp.headshot);
  mode = 'range';
  events.emit(EV.ENEMY_KILLED, { killer: 'player' });
  assert.equal(save.data.progression.xp, PROG.xp.kill + PROG.xp.headshot, 'poligon XP vermez');
  mode = 'mission';
  events.emit(EV.MISSION_ENDED, { success: true, stars: 3 });
  assert.ok(ups.includes(2), 'görev sonu seviye atlattı');
  const before = economy.credits;
  const r = sys.claimDaily();
  assert.equal(r.day, 1);
  assert.ok(economy.credits >= before + PROG.daily.credits[0]);
  assert.equal(sys.claimDaily(), null);
  assert.equal(save.data.progression.daily.last, '2026-10-14');
});
