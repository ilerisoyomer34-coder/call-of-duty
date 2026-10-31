// Yere düşme ve canlandırma kuralları (Operasyon Güncellemesi §7.3–7.7)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bleedOutFor, allyBleedOutFor, allyCanDie, reviveTime, assistScore, assistDecision, BleedOut, REVIVE } from '../src/downed.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('kan kaybı her düşüşte kısalır (30 → 20 → 12) ve zorlukla ölçeklenir', () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => bleedOutFor(n)), [30, 20, 12, 12]);
  near(bleedOutFor(1, 'easy'), 45);
  near(bleedOutFor(2, 'hard'), 14);
  near(allyBleedOutFor('normal'), 45);
});

test('asker ölümü zorluğa göre: Kolay kendi kalkar, Normal/Zor ölebilir', () => {
  assert.equal(allyCanDie('easy'), false);
  assert.equal(allyCanDie('normal'), true);
  assert.equal(allyCanDie('hard'), true);
});

test('canlandırma süresi: 3 sn, medik 2 sn, eğitimle −%25', () => {
  assert.equal(reviveTime(), 3);
  assert.equal(reviveTime({ medic: true }), 2);
  near(reviveTime({ medic: true, training: 0.75 }), 1.5);
});

test('yardım puanı ve karar (§7.4)', () => {
  // 10 m, tehdit yok, açık değil, medik: 100 − 12 + 20 = 108 → doğrudan
  const s1 = assistScore({ pathLen: 10, medic: true });
  assert.equal(s1, 108);
  assert.equal(assistDecision(s1), 'direct');
  // 25 m, iki tehdit, yarı açık yol, ateş altında: 100 − 30 − 36 − 15 − 25 = −6 → yardım edemez
  const s2 = assistScore({ pathLen: 25, threats: 2, exposure: 0.5, underFire: true });
  assert.equal(s2, -6);
  assert.equal(assistDecision(s2), 'cannot');
  // Aynı durum ama yardım çağrısı ve son saniyeler: −6 + 20 + 15 = 29 → önce temizle
  const s3 = assistScore({ pathLen: 25, threats: 2, exposure: 0.5, underFire: true, calledHelp: true, bleedLeft: 5 });
  assert.equal(s3, 29);
  assert.equal(assistDecision(s3), 'clearFirst');
  assert.equal(assistScore({ pathLen: null }), -Infinity, 'yol yok');
  assert.equal(assistScore({ pathLen: REVIVE.maxAssistDistance + 1 }), -Infinity, '40 m üstü');
  assert.equal(assistScore({ pathLen: 5, healthPct: 0.2 }), 100 - 6 - 30, 'kendisi ağır yaralı');
});

test('kan kaybı sayacı: canlandırılırken durur, hasar süreden düşer', () => {
  const b = new BleedOut(20);
  b.tick(5);
  assert.equal(b.left, 15);
  b.tick(5, true);
  assert.equal(b.left, 15, 'canlandırılırken durur');
  b.damage(20); // 20 × 0,25 sn
  assert.equal(b.left, 10);
  near(b.frac, 0.5);
  assert.equal(b.tick(10), true);
  assert.equal(b.expired, true);
});
